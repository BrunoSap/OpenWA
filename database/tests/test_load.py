#!/usr/bin/env python3
"""
database/tests/test_load.py
Load testing at production scale (36.5k rows/year = 100 rows/day)
Tests actual performance under realistic load
"""

import os
import sys
import time
import psycopg2
import psycopg2.extras
from datetime import datetime, timedelta
import random
import statistics

# Configuration
DB_CONFIG = {
    'dbname': os.getenv('DB_NAME', 'openwa'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', ''),
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432'),
}

# Test parameters
TOTAL_ROWS = 10000  # 10k rows (represents ~100 days of production data)
BATCH_SIZE = 100
QUERY_ITERATIONS = 1000

def get_connection():
    """Create database connection"""
    return psycopg2.connect(**DB_CONFIG)

def log_info(msg):
    print(f"[INFO] {msg}")

def log_error(msg):
    print(f"[ERROR] {msg}", file=sys.stderr)

def test_bulk_insert(conn):
    """Test bulk insert performance"""
    log_info(f"Test 1: Bulk Insert Performance ({TOTAL_ROWS} rows)")

    cur = conn.cursor()

    # Generate test data
    log_info("Generating test data...")
    conversations = []
    start_time = time.time()

    for i in range(TOTAL_ROWS):
        chat_id = f"55119{random.randint(10000000, 99999999)}"
        message_id = f"test_msg_{i}_{int(time.time())}"
        from_user = random.choice(['client', 'bot'])
        message_text = f"Test message {i}: " + " ".join([
            random.choice(['olá', 'preciso', 'ajuda', 'INSS', 'aposentadoria', 'documentos'])
            for _ in range(10)
        ])

        conversations.append((
            chat_id,
            message_id,
            from_user,
            message_text,
            'text'
        ))

    # Insert in batches
    log_info(f"Inserting {TOTAL_ROWS} rows in batches of {BATCH_SIZE}...")
    insert_start = time.time()

    for i in range(0, len(conversations), BATCH_SIZE):
        batch = conversations[i:i + BATCH_SIZE]
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO knowledge.conversations
            (chat_id, message_id, from_user, message_text, message_type)
            VALUES %s
            """,
            batch
        )

    conn.commit()
    insert_end = time.time()

    insert_duration = insert_end - insert_start
    rows_per_sec = TOTAL_ROWS / insert_duration

    log_info(f"✓ Inserted {TOTAL_ROWS} rows in {insert_duration:.2f}s")
    log_info(f"✓ Insert speed: {rows_per_sec:.0f} rows/sec")

    if rows_per_sec < 50:
        log_error(f"Insert speed below target (50 rows/sec): {rows_per_sec:.0f}")
        return False

    cur.close()
    return True

def test_query_performance(conn):
    """Test query performance under load"""
    log_info(f"Test 2: Query Performance ({QUERY_ITERATIONS} queries)")

    cur = conn.cursor()

    # Get some chat_ids to query
    cur.execute("""
        SELECT DISTINCT chat_id
        FROM knowledge.conversations
        WHERE deleted_at IS NULL
        LIMIT 100
    """)
    chat_ids = [row[0] for row in cur.fetchall()]

    if not chat_ids:
        log_error("No data to query")
        return False

    # Test different query patterns
    query_times = []

    log_info("Running query performance tests...")

    for i in range(QUERY_ITERATIONS):
        chat_id = random.choice(chat_ids)
        query_start = time.time()

        # Simulate typical query: get recent messages for a chat
        cur.execute("""
            SELECT id, message_text, timestamp, from_user
            FROM knowledge.conversations
            WHERE chat_id = %s AND deleted_at IS NULL
            ORDER BY timestamp DESC
            LIMIT 10
        """, (chat_id,))

        rows = cur.fetchall()
        query_end = time.time()

        query_time_ms = (query_end - query_start) * 1000
        query_times.append(query_time_ms)

    # Calculate statistics
    avg_time = statistics.mean(query_times)
    p50_time = statistics.median(query_times)
    p95_time = statistics.quantiles(query_times, n=20)[18]  # 95th percentile
    p99_time = statistics.quantiles(query_times, n=100)[98]  # 99th percentile
    max_time = max(query_times)

    log_info(f"✓ Completed {QUERY_ITERATIONS} queries")
    log_info(f"  Avg: {avg_time:.2f}ms")
    log_info(f"  P50: {p50_time:.2f}ms")
    log_info(f"  P95: {p95_time:.2f}ms")
    log_info(f"  P99: {p99_time:.2f}ms")
    log_info(f"  Max: {max_time:.2f}ms")

    # Check against targets
    success = True
    if avg_time > 50:
        log_error(f"Average query time above target (50ms): {avg_time:.2f}ms")
        success = False

    if p95_time > 80:
        log_error(f"P95 query time above target (80ms): {p95_time:.2f}ms")
        success = False

    cur.close()
    return success

def test_index_effectiveness(conn):
    """Test index usage with EXPLAIN ANALYZE"""
    log_info("Test 3: Index Effectiveness")

    cur = conn.cursor()

    # Get a sample chat_id
    cur.execute("""
        SELECT chat_id FROM knowledge.conversations
        WHERE deleted_at IS NULL
        LIMIT 1
    """)
    chat_id = cur.fetchone()[0]

    # Test query with EXPLAIN ANALYZE
    cur.execute("""
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT id, message_text, timestamp
        FROM knowledge.conversations
        WHERE chat_id = %s AND deleted_at IS NULL
        ORDER BY timestamp DESC
        LIMIT 10
    """, (chat_id,))

    explain = cur.fetchone()[0][0]
    execution_time = explain['Execution Time']
    plan = explain['Plan']

    # Check if index is used
    uses_index = 'Index' in str(plan)

    log_info(f"  Execution time: {execution_time:.2f}ms")
    log_info(f"  Uses index: {uses_index}")

    if not uses_index:
        log_error("Query is not using index!")
        return False

    if execution_time > 10:
        log_error(f"Index scan too slow: {execution_time:.2f}ms")
        return False

    log_info("✓ Index effectiveness test passed")

    cur.close()
    return True

def test_concurrent_access(conn):
    """Test concurrent write access"""
    log_info("Test 4: Concurrent Access")

    # This is a simplified test - real concurrent testing would need threads/processes
    cur = conn.cursor()

    # Get a client
    cur.execute("""
        INSERT INTO knowledge.clients (chat_id, phone, full_name)
        VALUES ('test_concurrent_001', '+5511888888888', 'Test Concurrent')
        ON CONFLICT (chat_id) DO UPDATE SET full_name = EXCLUDED.full_name
        RETURNING id
    """)
    client_id = cur.fetchone()[0]
    conn.commit()

    # Simulate concurrent updates
    initial_messages = 0
    iterations = 100

    start_time = time.time()

    for i in range(iterations):
        cur.execute("""
            UPDATE knowledge.clients
            SET total_messages = total_messages + 1
            WHERE id = %s
        """, (client_id,))
        conn.commit()

    end_time = time.time()

    # Verify final count
    cur.execute("SELECT total_messages FROM knowledge.clients WHERE id = %s", (client_id,))
    final_messages = cur.fetchone()[0]

    expected = initial_messages + iterations
    if final_messages != expected:
        log_error(f"Concurrent update mismatch: expected {expected}, got {final_messages}")
        return False

    duration = end_time - start_time
    updates_per_sec = iterations / duration

    log_info(f"✓ Completed {iterations} concurrent updates in {duration:.2f}s")
    log_info(f"✓ Update speed: {updates_per_sec:.0f} updates/sec")

    cur.close()
    return True

def cleanup_test_data(conn):
    """Clean up test data"""
    log_info("Cleaning up test data...")

    cur = conn.cursor()

    cur.execute("""
        DELETE FROM knowledge.conversations
        WHERE message_id LIKE 'test_msg_%'
    """)

    cur.execute("""
        DELETE FROM knowledge.clients
        WHERE chat_id LIKE 'test_concurrent_%'
    """)

    conn.commit()
    cur.close()

    log_info("✓ Cleanup complete")

def main():
    log_info("=== Load Testing at Production Scale ===")
    log_info(f"Database: {DB_CONFIG['dbname']}@{DB_CONFIG['host']}")
    log_info(f"Test scale: {TOTAL_ROWS} rows")
    print()

    try:
        conn = get_connection()
        log_info("✓ Database connection established")

        results = {
            'bulk_insert': test_bulk_insert(conn),
            'query_performance': test_query_performance(conn),
            'index_effectiveness': test_index_effectiveness(conn),
            'concurrent_access': test_concurrent_access(conn),
        }

        cleanup_test_data(conn)
        conn.close()

        print()
        log_info("=== Load Test Summary ===")
        for test_name, passed in results.items():
            status = "✓ PASSED" if passed else "✗ FAILED"
            log_info(f"{test_name}: {status}")

        if all(results.values()):
            log_info("All load tests passed!")
            sys.exit(0)
        else:
            log_error("Some load tests failed")
            sys.exit(1)

    except Exception as e:
        log_error(f"Load testing failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
