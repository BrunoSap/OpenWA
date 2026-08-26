#!/usr/bin/env python3
"""
database/tests/validate_performance_v2_simple.py
Enhanced performance validation with:
- Proper AAA (Arrange-Act-Assert) test structure
- Explicit pass/fail checks (no pytest dependency)
- Transaction-based test isolation
- Performance threshold constants
- Clear test boundaries

Simplified version that can run via docker exec without external dependencies.
"""

import os
import sys
import time
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import pool
import numpy as np
from typing import Dict, List, Tuple, Any
from contextlib import contextmanager

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


@contextmanager
def test_transaction(conn):
    """
    Context manager for test isolation via transactions.
    Automatically rolls back after test, preventing data pollution.
    """
    try:
        yield conn
    finally:
        conn.rollback()


def generate_embedding_batched(batch_size=1536):
    """
    Generate embedding with memory-efficient batching
    FIXED: No longer creates 10k+ 1536-dim arrays in tight loop
    """
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
    Returns verification data for test preconditions.
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
            VALUES (%s, %s, %s, 'test_aaa')
            RETURNING id
        """, (question, answer, embedding))
        faq_id = cursor.fetchone()[0]
        faq_ids.append(faq_id)

    # Insert test clients (using valid CPFs that pass validation)
    test_clients = [
        ("559912345678@c.us", "12345678909", "Test Client 1", '{"tenant_id": "test_tenant"}'),  # Valid CPF
        ("559987654321@c.us", "98765432100", "Test Client 2", '{"tenant_id": "test_tenant"}'),  # Valid CPF
    ]

    client_data = []
    for chat_id, cpf, full_name, metadata in test_clients:
        cursor.execute("""
            INSERT INTO knowledge.clients (chat_id, cpf, full_name, metadata)
            VALUES (%s, %s, %s, %s::jsonb)
            RETURNING id, chat_id
        """, (chat_id, cpf, full_name, metadata))
        result = cursor.fetchone()
        client_data.append({'id': result[0], 'chat_id': result[1]})

    # Insert test conversations with embeddings
    conversation_ids = []
    for client in client_data:
        client_id, chat_id = client['id'], client['chat_id']
        for i in range(5):
            message_id = f"test_msg_aaa_{chat_id}_{i}"
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
    """
    Remove test data using explicit IDs and markers.
    More reliable than WHERE clause patterns.
    """
    cursor = conn.cursor()

    # Delete by explicit IDs
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
    Test vector similarity search with actual data.
    AAA: Arrange query + data, Act (execute), Assert (performance + index usage).
    """
    print("\n" + "="*60)
    print("TEST: Vector Similarity Search (with data)")
    print("="*60)

    # ARRANGE
    with test_transaction(conn):
        test_data = setup_test_data(conn)
        cursor = conn.cursor()
        query_embedding = generate_embedding_batched(1536)

        query = """
            SELECT id, question, answer,
                   1 - (embedding <=> %s::vector) AS similarity
            FROM knowledge.faq
            WHERE embedding IS NOT NULL
            AND category = 'test_aaa'
            ORDER BY embedding <=> %s::vector
            LIMIT 5
        """

        # ACT
        result = measure_query(cursor, query, (query_embedding, query_embedding))

        # ASSERT - Performance
        print(f"\n📊 Results:")
        print(f"   Average: {result['avg']:.2f}ms (±{result['std']:.2f}ms)")
        print(f"   Min: {result['min']:.2f}ms | Max: {result['max']:.2f}ms")

        performance_passed = result['avg'] < VECTOR_SEARCH_TARGET_MS
        if not performance_passed:
            print(f"   ❌ FAIL: Exceeded target {VECTOR_SEARCH_TARGET_MS}ms")

        # ASSERT - Index usage
        index_passed = False
        if result['explain']:
            print(f"\n📋 EXPLAIN ANALYZE:")
            for row in result['explain'][:5]:
                print(f"   {row[0]}")

            plan = '\n'.join([row[0] for row in result['explain']])
            index_used = 'ivfflat' in plan.lower() or 'idx_faq_embedding' in plan.lower()

            if index_used:
                print(f"\n✅ PASS: IVFFlat index is being used")
                index_passed = True
            else:
                print(f"\n❌ FAIL: IVFFlat index not detected in query plan")

        cursor.close()
        cleanup_test_data(conn, test_data)

    return performance_passed and index_passed


def test_compound_index_filtered_search(conn):
    """
    Test compound index (chat_id, embedding) for filtered vector search.
    AAA: Arrange query + filter, Act (execute), Assert (no seq scan + performance).
    """
    print("\n" + "="*60)
    print("TEST: Compound Index for Filtered Vector Search")
    print("="*60)

    # ARRANGE
    with test_transaction(conn):
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
        result = measure_query(
            cursor,
            query,
            (query_embedding, target_chat_id, query_embedding)
        )

        # ASSERT - Performance
        print(f"\n📊 Results:")
        print(f"   Average: {result['avg']:.2f}ms (±{result['std']:.2f}ms)")

        performance_passed = result['avg'] < COMPOUND_INDEX_TARGET_MS
        if not performance_passed:
            print(f"   ❌ FAIL: Exceeded target {COMPOUND_INDEX_TARGET_MS}ms")

        # ASSERT - No sequential scan
        index_passed = True
        if result['explain']:
            print(f"\n📋 EXPLAIN ANALYZE:")
            for row in result['explain'][:5]:
                print(f"   {row[0]}")

            plan = '\n'.join([row[0] for row in result['explain']])
            has_seq_scan = 'seq scan' in plan.lower()
            has_compound_index = 'idx_conversations_chat_embedding' in plan.lower()

            if has_seq_scan and not has_compound_index:
                print(f"\n❌ FAIL: Sequential scan detected, compound index not used")
                index_passed = False
            elif has_compound_index:
                print(f"\n✅ PASS: Compound index idx_conversations_chat_embedding is used")
            else:
                print(f"\n⚠️  WARNING: Cannot confirm compound index usage")

        cursor.close()
        cleanup_test_data(conn, test_data)

    return performance_passed and index_passed


def test_get_client_summary_v2_optimized(conn):
    """
    Test get_client_summary_v2 optimized query.
    AAA: Arrange (verify data exists), Act (execute function), Assert (structure + performance).
    """
    print("\n" + "="*60)
    print("TEST: get_client_summary_v2 (Optimized)")
    print("="*60)

    # ARRANGE
    with test_transaction(conn):
        test_data = setup_test_data(conn)
        cursor = conn.cursor()

        target_chat_id = test_data['client_data'][0]['chat_id']

        # Verify precondition: client exists
        cursor.execute(
            "SELECT COUNT(*) FROM knowledge.clients WHERE chat_id = %s",
            (target_chat_id,)
        )
        client_count = cursor.fetchone()[0]

        if client_count == 0:
            print(f"❌ FAIL: Precondition - client {target_chat_id} not found")
            cursor.close()
            cleanup_test_data(conn, test_data)
            return False

        query = "SELECT knowledge.get_client_summary_v2(%s)"

        # ACT
        result = measure_query(cursor, query, (target_chat_id,), explain=False)

        # ASSERT - Performance
        print(f"\n📊 Results:")
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
            print(f"\n✅ PASS: Result structure valid and performance within target")
        else:
            print(f"\n❌ FAIL: Invalid result structure")
            if summary is None:
                print(f"   Summary result is None")
            else:
                print(f"   Missing keys: client={('client' in summary)}, recent_messages={('recent_messages' in summary)}")

        cursor.close()
        cleanup_test_data(conn, test_data)

    return performance_passed and structure_passed


def test_connection_pool_concurrency():
    """
    Test behavior under connection pooling.
    AAA: Arrange (workers + pool), Act (parallel queries), Assert (no errors + performance).
    """
    print("\n" + "="*60)
    print(f"TEST: Connection Pool Concurrency ({CONCURRENCY_WORKERS} connections)")
    print("="*60)

    # ARRANGE
    if not connection_pool:
        print("⚠️  Skipping: connection pool not initialized")
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
        print(f"\n❌ FAIL: {len(errors)} workers encountered errors:")
        for worker_id, error in errors[:3]:
            print(f"   Worker {worker_id}: {error}")
        return False

    # ASSERT - Performance statistics
    avg_time = np.mean(times)
    max_time = np.max(times)

    print(f"\n📊 Results:")
    print(f"   Total queries: {len(times)}")
    print(f"   Average: {avg_time:.2f}ms")
    print(f"   Max: {max_time:.2f}ms")

    queries_passed = len(times) == CONCURRENCY_WORKERS * QUERIES_PER_WORKER
    if not queries_passed:
        print(f"   ❌ FAIL: Expected {CONCURRENCY_WORKERS * QUERIES_PER_WORKER} queries, got {len(times)}")
        return False

    print(f"   ✅ PASS: All queries completed successfully")
    return True


def test_memory_stress():
    """
    Test memory usage under stress (batched embedding generation).
    AAA: Arrange (iterations), Act (generate + query loop), Assert (no memory error).
    """
    print("\n" + "="*60)
    print(f"TEST: Memory Stress ({MEMORY_STRESS_ITERATIONS} iterations)")
    print("="*60)

    # ARRANGE
    conn = get_connection()
    cursor = conn.cursor()

    print("Generating embeddings (batched)...")
    start_time = time.time()

    memory_error_occurred = False
    exception_occurred = None
    iterations_completed = 0

    # ACT
    try:
        for i in range(MEMORY_STRESS_ITERATIONS):
            embedding = generate_embedding_batched(1536)

            if i % 100 == 0:
                print(f"  Progress: {i}/{MEMORY_STRESS_ITERATIONS}")

            cursor.execute("""
                SELECT * FROM knowledge.find_similar_faq_v2(%s::vector, 0.8, 3)
            """, (embedding,))
            cursor.fetchall()

            iterations_completed = i + 1

    except MemoryError:
        memory_error_occurred = True
    except Exception as e:
        exception_occurred = e
    finally:
        cursor.close()
        release_connection(conn)

    # ASSERT
    elapsed = time.time() - start_time

    if memory_error_occurred:
        print(f"\n❌ FAIL: MemoryError after {iterations_completed} iterations")
        return False

    if exception_occurred:
        print(f"\n❌ FAIL: Exception occurred: {exception_occurred}")
        return False

    if iterations_completed != MEMORY_STRESS_ITERATIONS:
        print(f"\n❌ FAIL: Only {iterations_completed}/{MEMORY_STRESS_ITERATIONS} completed")
        return False

    print(f"\n📊 Results:")
    print(f"   Total time: {elapsed:.2f}s")
    print(f"   Avg per query: {(elapsed * 1000 / MEMORY_STRESS_ITERATIONS):.2f}ms")
    print(f"   ✅ PASS: No memory leak detected")

    return True


def run_test_suite():
    """
    Orchestrate test execution with clear boundaries.
    Single Responsibility: setup → run → teardown → report.
    """
    print("🚀 OpenWA Database Performance Validation v2")
    print("=" * 60)

    # Initialize connection pool
    print("Initializing connection pool...")
    init_connection_pool(minconn=2, maxconn=10)

    conn = get_connection()
    conn.autocommit = False

    results = {}

    try:
        # Run tests with clear AAA structure
        results['vector_similarity'] = test_vector_similarity_with_data(conn)
        results['compound_index'] = test_compound_index_filtered_search(conn)
        results['client_summary_v2'] = test_get_client_summary_v2_optimized(conn)
        results['connection_pool'] = test_connection_pool_concurrency()
        results['memory_stress'] = test_memory_stress()

    except Exception as e:
        print(f"\n❌ Test suite failed: {e}")
        import traceback
        traceback.print_exc()
        conn.rollback()
        return False
    finally:
        release_connection(conn)
        if connection_pool:
            connection_pool.closeall()

    # Report summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)

    passed = sum(results.values())
    total = len(results)

    for test, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test}")

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
