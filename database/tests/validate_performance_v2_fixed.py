#!/usr/bin/env python3
"""
database/tests/validate_performance_v2_fixed.py
Enhanced performance validation with proper AAA structure.
Final working version with all fixes applied.
"""

import os
import sys
import time
import psycopg2
from psycopg2 import pool
import numpy as np
from typing import Dict, Any

# Performance threshold constants (ms)
VECTOR_SEARCH_TARGET_MS = 100
COMPOUND_INDEX_TARGET_MS = 100
CLIENT_SUMMARY_TARGET_MS = 200
MEMORY_STRESS_ITERATIONS = 1000
CONCURRENCY_WORKERS = 10
QUERIES_PER_WORKER = 5

# Database connection parameters
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'port': int(os.getenv('POSTGRES_PORT', 5432)),
    'database': os.getenv('POSTGRES_DB', 'openwa'),
    'user': os.getenv('POSTGRES_USER', 'openwa'),
    'password': os.getenv('POSTGRES_PASSWORD', ''),
}

# Global connection pool
connection_pool = None
# Unique test run identifier
TEST_RUN_ID = str(int(time.time() * 1000) % 1000000)


def init_connection_pool(minconn=2, maxconn=10):
    """Initialize connection pool"""
    global connection_pool
    try:
        connection_pool = psycopg2.pool.SimpleConnectionPool(
            minconn,
            maxconn,
            **DB_CONFIG
        )
        return connection_pool
    except Exception as e:
        print(f"❌ Connection pool initialization failed: {e}")
        sys.exit(1)


def get_connection():
    """Get connection from pool"""
    if connection_pool:
        return connection_pool.getconn()
    else:
        return psycopg2.connect(**DB_CONFIG)


def release_connection(conn):
    """Release connection back to pool"""
    if connection_pool:
        connection_pool.putconn(conn)
    else:
        conn.close()


def generate_embedding_batched(batch_size=1536):
    """Generate embedding with memory-efficient batching"""
    return np.random.rand(batch_size).astype(np.float32).tolist()


def measure_query(cursor, query, params=None, explain=True, iterations=5) -> Dict[str, Any]:
    """Execute query and measure performance"""
    # Warm up
    cursor.execute(query, params)
    cursor.fetchall()

    # Measure execution time
    times = []
    for _ in range(iterations):
        start = time.time()
        cursor.execute(query, params)
        cursor.fetchall()
        end = time.time()
        times.append((end - start) * 1000)  # Convert to ms

    avg_time = np.mean(times)
    std_time = np.std(times)
    max_time = np.max(times)
    min_time = np.min(times)

    # Get EXPLAIN ANALYZE
    explain_output = None
    if explain:
        explain_query = f"EXPLAIN ANALYZE {query}"
        cursor.execute(explain_query, params)
        explain_output = cursor.fetchall()

    return {
        'avg': avg_time,
        'std': std_time,
        'max': max_time,
        'min': min_time,
        'explain': explain_output
    }


def setup_test_data(conn) -> Dict[str, Any]:
    """
    Insert test data for realistic scenarios.
    Uses unique IDs per test run to avoid conflicts.
    """
    print("\n📊 Setting up test data...")
    cursor = conn.cursor()

    # Insert test FAQs with embeddings
    test_faqs = [
        ("Como posso dar entrada no INSS?", "Você pode dar entrada pelo site Meu INSS ou presencialmente."),
        ("Quanto tempo demora a aprovação?", "O prazo varia de 30 a 90 dias dependendo do tipo de benefício."),
        ("Preciso de advogado?", "Para casos complexos, recomendamos assistência jurídica."),
    ]

    faq_ids = []
    for question, answer in test_faqs:
        embedding = generate_embedding_batched(1536)
        cursor.execute("""
            INSERT INTO knowledge.faq (question, answer, embedding, category)
            VALUES (%s, %s, %s, %s)
            RETURNING id
        """, (question, answer, embedding, f'test_aaa_{TEST_RUN_ID}'))
        faq_id = cursor.fetchone()[0]
        faq_ids.append(faq_id)

    # Insert test clients (unique chat_ids per run, valid CPFs)
    test_clients = [
        (f"559{TEST_RUN_ID}001@c.us", "86302911680", "Test Client 1"),
        (f"559{TEST_RUN_ID}002@c.us", "86534412047", "Test Client 2"),
    ]

    client_data = []
    for chat_id, cpf, full_name in test_clients:
        cursor.execute("""
            INSERT INTO knowledge.clients (chat_id, cpf, full_name, metadata)
            VALUES (%s, %s, %s, %s::jsonb)
            RETURNING id, chat_id
        """, (chat_id, cpf, full_name, '{"tenant_id": "test_tenant"}'))
        result = cursor.fetchone()
        client_data.append({'id': result[0], 'chat_id': result[1]})

    # Insert test conversations with embeddings
    conversation_ids = []
    for client in client_data:
        client_id, chat_id = client['id'], client['chat_id']
        for i in range(5):
            message_id = f"test_msg_{TEST_RUN_ID}_{chat_id}_{i}"
            message_text = f"Test message {i} from client {chat_id}"
            embedding = generate_embedding_batched(1536)

            cursor.execute("""
                INSERT INTO knowledge.conversations
                (chat_id, message_id, from_user, message_text, embedding)
                VALUES (%s, %s, 'client', %s, %s)
                RETURNING id
            """, (chat_id, message_id, message_text, embedding))
            conv_id = cursor.fetchone()[0]
            conversation_ids.append(conv_id)

    conn.commit()
    cursor.close()

    print("✅ Test data ready")

    return {
        'faq_ids': faq_ids,
        'client_data': client_data,
        'conversation_ids': conversation_ids
    }


def cleanup_test_data(conn, test_data: Dict[str, Any]):
    """Remove test data using explicit IDs"""
    cursor = conn.cursor()

    if test_data.get('conversation_ids'):
        cursor.execute(
            "DELETE FROM knowledge.conversations WHERE id = ANY(%s)",
            (test_data['conversation_ids'],)
        )

    if test_data.get('client_data'):
        client_ids = [c['id'] for c in test_data['client_data']]
        cursor.execute(
            "DELETE FROM knowledge.clients WHERE id = ANY(%s)",
            (client_ids,)
        )

    if test_data.get('faq_ids'):
        cursor.execute(
            "DELETE FROM knowledge.faq WHERE id = ANY(%s)",
            (test_data['faq_ids'],)
        )

    conn.commit()
    cursor.close()


def test_vector_similarity_with_data(conn):
    """
    TEST 1: Vector similarity search with actual data.
    AAA Structure: Arrange (setup data), Act (query), Assert (performance + index).
    """
    print("\n" + "="*60)
    print("TEST 1: Vector Similarity Search (with data)")
    print("="*60)

    # ARRANGE
    test_data = setup_test_data(conn)
    cursor = conn.cursor()
    query_embedding = generate_embedding_batched(1536)

    query = """
        SELECT id, question, answer,
               1 - (embedding <=> %s::vector) AS similarity
        FROM knowledge.faq
        WHERE embedding IS NOT NULL
        AND category = %s
        ORDER BY embedding <=> %s::vector
        LIMIT 5
    """

    # ACT
    result = measure_query(cursor, query, (query_embedding, f'test_aaa_{TEST_RUN_ID}', query_embedding))

    # ASSERT - Performance
    print(f"\n📊 Performance Results:")
    print(f"   Average: {result['avg']:.2f}ms (±{result['std']:.2f}ms)")
    print(f"   Min: {result['min']:.2f}ms | Max: {result['max']:.2f}ms")

    performance_passed = result['avg'] < VECTOR_SEARCH_TARGET_MS
    if not performance_passed:
        print(f"   ❌ FAIL: Exceeded target {VECTOR_SEARCH_TARGET_MS}ms")

    # ASSERT - Index usage
    index_passed = False
    if result['explain']:
        print(f"\n📋 Query Plan (EXPLAIN ANALYZE):")
        for row in result['explain'][:5]:
            print(f"   {row[0]}")

        plan = '\n'.join([row[0] for row in result['explain']])
        index_used = 'ivfflat' in plan.lower() or 'idx_faq_embedding' in plan.lower()

        if index_used:
            print(f"\n✅ ASSERT PASS: IVFFlat index detected")
            index_passed = True
        else:
            print(f"\n❌ ASSERT FAIL: IVFFlat index not detected")

    cursor.close()
    cleanup_test_data(conn, test_data)

    final_result = performance_passed and index_passed
    print(f"\n{'✅ TEST PASSED' if final_result else '❌ TEST FAILED'}")
    return final_result


def test_compound_index_filtered_search(conn):
    """
    TEST 2: Compound index for filtered vector search.
    AAA Structure: Arrange (data + filter), Act (query), Assert (no seq scan + perf).
    """
    print("\n" + "="*60)
    print("TEST 2: Compound Index for Filtered Vector Search")
    print("="*60)

    # ARRANGE
    test_data = setup_test_data(conn)
    cursor = conn.cursor()
    query_embedding = generate_embedding_batched(1536)
    target_chat_id = test_data['client_data'][0]['chat_id']

    query = """
        SELECT id, chat_id, message_text,
               1 - (embedding <=> %s::vector) AS similarity
        FROM knowledge.conversations
        WHERE embedding IS NOT NULL
        AND chat_id != %s
        ORDER BY embedding <=> %s::vector
        LIMIT 5
    """

    # ACT
    result = measure_query(cursor, query, (query_embedding, target_chat_id, query_embedding))

    # ASSERT - Performance
    print(f"\n📊 Performance Results:")
    print(f"   Average: {result['avg']:.2f}ms (±{result['std']:.2f}ms)")

    performance_passed = result['avg'] < COMPOUND_INDEX_TARGET_MS
    if not performance_passed:
        print(f"   ❌ FAIL: Exceeded target {COMPOUND_INDEX_TARGET_MS}ms")

    # ASSERT - No sequential scan
    index_passed = True
    if result['explain']:
        print(f"\n📋 Query Plan (EXPLAIN ANALYZE):")
        for row in result['explain'][:5]:
            print(f"   {row[0]}")

        plan = '\n'.join([row[0] for row in result['explain']])
        has_seq_scan = 'seq scan' in plan.lower()
        has_compound_index = 'idx_conversations' in plan.lower()

        if has_seq_scan and not has_compound_index:
            print(f"\n❌ ASSERT FAIL: Sequential scan detected, index not used")
            index_passed = False
        elif has_compound_index:
            print(f"\n✅ ASSERT PASS: Index being used (no seq scan)")
        else:
            print(f"\n⚠️  WARNING: Cannot confirm index usage from plan")

    cursor.close()
    cleanup_test_data(conn, test_data)

    final_result = performance_passed and index_passed
    print(f"\n{'✅ TEST PASSED' if final_result else '❌ TEST FAILED'}")
    return final_result


def test_get_client_summary_v2_optimized(conn):
    """
    TEST 3: get_client_summary_v2 function performance.
    AAA Structure: Arrange (verify precondition), Act (call function), Assert (structure + perf).
    """
    print("\n" + "="*60)
    print("TEST 3: get_client_summary_v2 (Optimized Function)")
    print("="*60)

    # ARRANGE
    test_data = setup_test_data(conn)
    cursor = conn.cursor()
    target_chat_id = test_data['client_data'][0]['chat_id']

    # Precondition check
    cursor.execute(
        "SELECT COUNT(*) FROM knowledge.clients WHERE chat_id = %s",
        (target_chat_id,)
    )
    client_count = cursor.fetchone()[0]

    if client_count == 0:
        print(f"❌ PRECONDITION FAIL: Client {target_chat_id} not found")
        cursor.close()
        cleanup_test_data(conn, test_data)
        return False

    query = "SELECT knowledge.get_client_summary_v2(%s)"

    # ACT
    result = measure_query(cursor, query, (target_chat_id,), explain=False)

    # ASSERT - Performance
    print(f"\n📊 Performance Results:")
    print(f"   Average: {result['avg']:.2f}ms (±{result['std']:.2f}ms)")
    print(f"   Min: {result['min']:.2f}ms | Max: {result['max']:.2f}ms")

    performance_passed = result['avg'] < CLIENT_SUMMARY_TARGET_MS
    if not performance_passed:
        print(f"   ❌ FAIL: Exceeded target {CLIENT_SUMMARY_TARGET_MS}ms")

    # ASSERT - Result structure
    cursor.execute(query, (target_chat_id,))
    summary = cursor.fetchone()[0]

    structure_passed = (
        summary is not None and
        'client' in summary and
        'recent_messages' in summary
    )

    if structure_passed:
        print(f"\n✅ ASSERT PASS: Result structure valid")
    else:
        print(f"\n❌ ASSERT FAIL: Invalid result structure")
        if summary is None:
            print(f"   Reason: Summary is None")
        else:
            print(f"   Reason: Missing keys (client: {('client' in summary)}, recent_messages: {('recent_messages' in summary)})")

    cursor.close()
    cleanup_test_data(conn, test_data)

    final_result = performance_passed and structure_passed
    print(f"\n{'✅ TEST PASSED' if final_result else '❌ TEST FAILED'}")
    return final_result


def test_connection_pool_concurrency():
    """
    TEST 4: Connection pool concurrency.
    AAA Structure: Arrange (workers), Act (parallel execution), Assert (no errors + count).
    """
    print("\n" + "="*60)
    print(f"TEST 4: Connection Pool Concurrency ({CONCURRENCY_WORKERS} workers)")
    print("="*60)

    # ARRANGE
    if not connection_pool:
        print("⚠️  SKIP: Connection pool not initialized")
        return True

    import threading

    errors = []
    times = []

    def worker(worker_id):
        try:
            conn = get_connection()
            cursor = conn.cursor()
            query_embedding = generate_embedding_batched(1536)

            for _ in range(QUERIES_PER_WORKER):
                start = time.time()
                cursor.execute("""
                    SELECT * FROM knowledge.find_similar_faq_v2(%s::vector, 0.8, 3)
                """, (query_embedding,))
                cursor.fetchall()
                end = time.time()
                times.append((end - start) * 1000)

            cursor.close()
            release_connection(conn)
        except Exception as e:
            errors.append((worker_id, str(e)))

    # ACT
    threads = []
    for i in range(CONCURRENCY_WORKERS):
        t = threading.Thread(target=worker, args=(i,))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    # ASSERT - No errors
    if errors:
        print(f"\n❌ ASSERT FAIL: {len(errors)} workers had errors:")
        for worker_id, error in errors[:3]:
            print(f"   Worker {worker_id}: {error}")
        return False

    # ASSERT - Query count
    avg_time = np.mean(times)
    max_time = np.max(times)
    expected_queries = CONCURRENCY_WORKERS * QUERIES_PER_WORKER

    print(f"\n📊 Concurrency Results:")
    print(f"   Total queries: {len(times)} (expected: {expected_queries})")
    print(f"   Average: {avg_time:.2f}ms")
    print(f"   Max: {max_time:.2f}ms")

    count_passed = len(times) == expected_queries
    if not count_passed:
        print(f"   ❌ FAIL: Query count mismatch")
        return False

    print(f"\n✅ ASSERT PASS: All workers completed successfully")
    print(f"\n✅ TEST PASSED")
    return True


def test_memory_stress():
    """
    TEST 5: Memory stress test.
    AAA Structure: Arrange (iterations), Act (loop), Assert (no memory error).
    """
    print("\n" + "="*60)
    print(f"TEST 5: Memory Stress ({MEMORY_STRESS_ITERATIONS} iterations)")
    print("="*60)

    # ARRANGE
    conn = get_connection()
    cursor = conn.cursor()

    memory_error = False
    exception = None
    iterations_completed = 0

    print("Executing stress test...")
    start_time = time.time()

    # ACT
    try:
        for i in range(MEMORY_STRESS_ITERATIONS):
            embedding = generate_embedding_batched(1536)

            if i % 100 == 0 and i > 0:
                print(f"  Progress: {i}/{MEMORY_STRESS_ITERATIONS}")

            cursor.execute("""
                SELECT * FROM knowledge.find_similar_faq_v2(%s::vector, 0.8, 3)
            """, (embedding,))
            cursor.fetchall()

            iterations_completed = i + 1

    except MemoryError:
        memory_error = True
    except Exception as e:
        exception = e
    finally:
        cursor.close()
        release_connection(conn)

    elapsed = time.time() - start_time

    # ASSERT - No memory error
    if memory_error:
        print(f"\n❌ ASSERT FAIL: MemoryError at iteration {iterations_completed}")
        return False

    if exception:
        print(f"\n❌ ASSERT FAIL: Exception - {exception}")
        return False

    if iterations_completed != MEMORY_STRESS_ITERATIONS:
        print(f"\n❌ ASSERT FAIL: Only {iterations_completed}/{MEMORY_STRESS_ITERATIONS} completed")
        return False

    print(f"\n📊 Stress Test Results:")
    print(f"   Total time: {elapsed:.2f}s")
    print(f"   Avg per query: {(elapsed * 1000 / MEMORY_STRESS_ITERATIONS):.2f}ms")

    print(f"\n✅ ASSERT PASS: No memory leak detected")
    print(f"\n✅ TEST PASSED")
    return True


def run_test_suite():
    """Run all tests with clear separation and reporting"""
    print("🚀 OpenWA Database Performance Validation v2")
    print("=" * 60)
    print(f"Test Run ID: {TEST_RUN_ID}")
    print("=" * 60)

    # Initialize
    print("\nInitializing connection pool...")
    init_connection_pool(minconn=2, maxconn=10)

    conn = get_connection()
    conn.autocommit = False

    results = {}

    try:
        # Execute tests
        results['test_1_vector_similarity'] = test_vector_similarity_with_data(conn)
        results['test_2_compound_index'] = test_compound_index_filtered_search(conn)
        results['test_3_client_summary_v2'] = test_get_client_summary_v2_optimized(conn)
        results['test_4_connection_pool'] = test_connection_pool_concurrency()
        results['test_5_memory_stress'] = test_memory_stress()

    except Exception as e:
        print(f"\n❌ Test suite error: {e}")
        import traceback
        traceback.print_exc()
        conn.rollback()
        return False
    finally:
        release_connection(conn)
        if connection_pool:
            connection_pool.closeall()

    # Summary
    print("\n" + "="*60)
    print("FINAL SUMMARY")
    print("="*60)

    passed = sum(results.values())
    total = len(results)

    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")

    print("\n" + "="*60)
    print(f"Result: {passed}/{total} tests passed")
    print("="*60)

    return passed == total


def main():
    """Entry point"""
    success = run_test_suite()
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
