#!/usr/bin/env python3
"""
database/tests/validate_performance.py
Performance validation with EXPLAIN ANALYZE output
"""

import os
import sys
import time
import psycopg2
from psycopg2.extras import RealDictCursor
import numpy as np

# Database connection parameters
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'port': int(os.getenv('POSTGRES_PORT', 5432)),
    'database': os.getenv('POSTGRES_DB', 'openwa'),
    'user': os.getenv('POSTGRES_USER', 'postgres'),
    'password': os.getenv('POSTGRES_PASSWORD', ''),
}

def connect_db():
    """Establish database connection"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        sys.exit(1)

def measure_query(cursor, query, params=None, explain=True):
    """Execute query and measure performance"""
    # Warm up
    cursor.execute(query, params)
    cursor.fetchall()

    # Measure execution time
    times = []
    for _ in range(5):
        start = time.time()
        cursor.execute(query, params)
        cursor.fetchall()
        end = time.time()
        times.append((end - start) * 1000)  # Convert to ms

    avg_time = np.mean(times)
    std_time = np.std(times)

    # Get EXPLAIN ANALYZE
    explain_output = None
    if explain:
        explain_query = f"EXPLAIN ANALYZE {query}"
        cursor.execute(explain_query, params)
        explain_output = cursor.fetchall()

    return avg_time, std_time, explain_output

def test_vector_similarity(conn):
    """Test vector similarity search performance"""
    print("\n" + "="*60)
    print("TEST: Vector Similarity Search (IVFFlat)")
    print("="*60)

    cursor = conn.cursor()

    # Create dummy embedding
    dummy_embedding = np.random.rand(1536).tolist()

    query = """
        SELECT id, question, answer,
               1 - (embedding <=> %s::vector) AS similarity
        FROM knowledge.faq
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> %s::vector
        LIMIT 5
    """

    avg_time, std_time, explain = measure_query(
        cursor, query, (dummy_embedding, dummy_embedding)
    )

    print(f"\n📊 Results:")
    print(f"   Average: {avg_time:.2f}ms (±{std_time:.2f}ms)")

    if explain:
        print(f"\n📋 EXPLAIN ANALYZE:")
        for row in explain:
            print(f"   {row[0]}")

    # Check if IVFFlat index is used
    plan = '\n'.join([row[0] for row in explain]) if explain else ''
    if 'ivfflat' in plan.lower():
        print(f"\n✅ PASS: IVFFlat index is being used")
    else:
        print(f"\n⚠️  WARNING: IVFFlat index may not be used (check if data exists)")

    cursor.close()
    return avg_time < 50  # Target: <50ms

def test_jsonb_query(conn):
    """Test JSONB GIN index performance"""
    print("\n" + "="*60)
    print("TEST: JSONB Query (GIN Index)")
    print("="*60)

    cursor = conn.cursor()

    query = """
        SELECT id, chat_id, case_type
        FROM intake_staging.leads
        WHERE case_data->>'age' = '65'
        LIMIT 10
    """

    avg_time, std_time, explain = measure_query(cursor, query)

    print(f"\n📊 Results:")
    print(f"   Average: {avg_time:.2f}ms (±{std_time:.2f}ms)")

    if explain:
        print(f"\n📋 EXPLAIN ANALYZE:")
        for row in explain:
            print(f"   {row[0]}")

    # Check if GIN index is used
    plan = '\n'.join([row[0] for row in explain]) if explain else ''
    if 'gin' in plan.lower() or 'idx_leads_case_data_gin' in plan.lower():
        print(f"\n✅ PASS: GIN index is being used")
    else:
        print(f"\n⚠️  WARNING: GIN index not used (may need data or ANALYZE)")

    cursor.close()
    return avg_time < 100  # Target: <100ms

def test_partial_index(conn):
    """Test partial index for unsynced leads"""
    print("\n" + "="*60)
    print("TEST: Partial Index (Unsynced Leads)")
    print("="*60)

    cursor = conn.cursor()

    query = """
        SELECT id, chat_id, intake_status
        FROM intake_staging.leads
        WHERE lawapp_synced = false
          AND intake_status = 'completed'
        LIMIT 10
    """

    avg_time, std_time, explain = measure_query(cursor, query)

    print(f"\n📊 Results:")
    print(f"   Average: {avg_time:.2f}ms (±{std_time:.2f}ms)")

    if explain:
        print(f"\n📋 EXPLAIN ANALYZE:")
        for row in explain:
            print(f"   {row[0]}")

    # Check if partial index is used
    plan = '\n'.join([row[0] for row in explain]) if explain else ''
    if 'idx_leads_unsynced' in plan.lower():
        print(f"\n✅ PASS: Partial index idx_leads_unsynced is being used")
    else:
        print(f"\n⚠️  WARNING: Partial index not used")

    cursor.close()
    return avg_time < 50  # Target: <50ms

def test_helper_functions(conn):
    """Test helper function performance"""
    print("\n" + "="*60)
    print("TEST: Helper Function (find_similar_faq)")
    print("="*60)

    cursor = conn.cursor()

    dummy_embedding = np.random.rand(1536).tolist()

    query = """
        SELECT * FROM knowledge.find_similar_faq(%s::vector, 0.8, 3)
    """

    avg_time, std_time, explain = measure_query(
        cursor, query, (dummy_embedding,), explain=False
    )

    print(f"\n📊 Results:")
    print(f"   Average: {avg_time:.2f}ms (±{std_time:.2f}ms)")

    # Test NULL handling
    try:
        cursor.execute("SELECT * FROM knowledge.find_similar_faq(NULL::vector, 0.8, 3)")
        print(f"\n❌ FAIL: NULL embedding was accepted (should raise error)")
        result = False
    except psycopg2.Error as e:
        if 'cannot be NULL' in str(e):
            print(f"\n✅ PASS: NULL embedding properly rejected")
            conn.rollback()
            result = True
        else:
            print(f"\n❌ FAIL: Unexpected error: {e}")
            conn.rollback()
            result = False

    cursor.close()
    return result and avg_time < 100  # Target: <100ms

def test_updated_at_trigger(conn):
    """Test updated_at trigger performance"""
    print("\n" + "="*60)
    print("TEST: updated_at Trigger Performance")
    print("="*60)

    cursor = conn.cursor()

    # Insert test record
    cursor.execute("""
        INSERT INTO knowledge.clients (chat_id, full_name)
        VALUES ('perf_test_trigger', 'Test User')
    """)

    # Measure update performance
    query = """
        UPDATE knowledge.clients
        SET full_name = 'Updated User'
        WHERE chat_id = 'perf_test_trigger'
    """

    times = []
    for _ in range(10):
        start = time.time()
        cursor.execute(query)
        end = time.time()
        times.append((end - start) * 1000)

    avg_time = np.mean(times)
    std_time = np.std(times)

    print(f"\n📊 Results:")
    print(f"   Average: {avg_time:.2f}ms (±{std_time:.2f}ms)")

    # Verify trigger worked
    cursor.execute("""
        SELECT updated_at > created_at AS trigger_worked
        FROM knowledge.clients
        WHERE chat_id = 'perf_test_trigger'
    """)
    trigger_worked = cursor.fetchone()[0]

    if trigger_worked:
        print(f"\n✅ PASS: updated_at trigger is working")
    else:
        print(f"\n❌ FAIL: updated_at trigger did not update timestamp")

    # Cleanup
    cursor.execute("DELETE FROM knowledge.clients WHERE chat_id = 'perf_test_trigger'")
    conn.commit()

    cursor.close()
    return trigger_worked and avg_time < 10  # Target: <10ms

def main():
    """Run all performance tests"""
    print("🚀 OpenWA Database Performance Validation")
    print("=" * 60)

    conn = connect_db()
    conn.autocommit = False

    results = {}

    try:
        results['vector_similarity'] = test_vector_similarity(conn)
        results['jsonb_query'] = test_jsonb_query(conn)
        results['partial_index'] = test_partial_index(conn)
        results['helper_functions'] = test_helper_functions(conn)
        results['updated_at_trigger'] = test_updated_at_trigger(conn)

    except Exception as e:
        print(f"\n❌ Test suite failed: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()

    # Summary
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

    sys.exit(0 if passed == total else 1)

if __name__ == '__main__':
    main()
