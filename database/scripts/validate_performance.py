#!/usr/bin/env python3
# database/scripts/validate_performance.py
"""
Performance validation for pgvector setup.
Tests:
- Insert 1000 dummy embeddings
- Measure IVFFlat query speed
- Validate < 50ms for similarity search
"""

import os
import time
import psycopg2
import numpy as np
from typing import List, Tuple

DB_HOST = os.getenv('POSTGRES_HOST', 'localhost')
DB_PORT = os.getenv('POSTGRES_PORT', '5432')
DB_NAME = os.getenv('POSTGRES_DB', 'openwa')
DB_USER = os.getenv('POSTGRES_USER', 'postgres')
DB_PASSWORD = os.getenv('POSTGRES_PASSWORD', '')

def generate_embedding() -> List[float]:
    """Generate random 1536-dim embedding."""
    return np.random.rand(1536).tolist()

def insert_dummy_conversations(conn, count: int = 1000) -> None:
    """Insert dummy conversations with embeddings."""
    print(f"📝 Inserting {count} dummy conversations...")

    cursor = conn.cursor()
    start = time.time()

    for i in range(count):
        embedding = generate_embedding()
        embedding_str = '[' + ','.join(map(str, embedding)) + ']'

        cursor.execute("""
            INSERT INTO knowledge.conversations
            (chat_id, message_id, from_user, message_text, embedding)
            VALUES (%s, %s, %s, %s, %s::vector)
        """, (
            f'dummy{i}@c.us',
            f'msg_{i}',
            'client',
            f'Dummy message {i}',
            embedding_str
        ))

        if (i + 1) % 100 == 0:
            conn.commit()
            print(f"  ... {i + 1} / {count}")

    conn.commit()
    elapsed = time.time() - start
    print(f"✅ Inserted {count} conversations in {elapsed:.2f}s ({count/elapsed:.1f} rows/sec)")

def test_similarity_search(conn, iterations: int = 100) -> Tuple[float, float]:
    """Test similarity search performance."""
    print(f"🔍 Testing similarity search ({iterations} iterations)...")

    cursor = conn.cursor()
    times = []

    for i in range(iterations):
        query_embedding = generate_embedding()
        embedding_str = '[' + ','.join(map(str, query_embedding)) + ']'

        start = time.time()
        cursor.execute("""
            SELECT id, chat_id, 1 - (embedding <=> %s::vector) AS similarity
            FROM knowledge.conversations
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> %s::vector
            LIMIT 5
        """, (embedding_str, embedding_str))

        results = cursor.fetchall()
        elapsed_ms = (time.time() - start) * 1000
        times.append(elapsed_ms)

        if len(results) != 5:
            raise Exception(f"Expected 5 results, got {len(results)}")

    avg_time = np.mean(times)
    p95_time = np.percentile(times, 95)

    print(f"✅ Avg query time: {avg_time:.2f}ms, P95: {p95_time:.2f}ms")
    return avg_time, p95_time

def cleanup(conn) -> None:
    """Delete dummy data."""
    print("🧹 Cleaning up dummy data...")
    cursor = conn.cursor()
    cursor.execute("DELETE FROM knowledge.conversations WHERE chat_id LIKE 'dummy%@c.us'")
    conn.commit()
    print("✅ Cleanup complete")

def main():
    print("🚀 Starting performance validation...")
    print(f"Database: {DB_NAME}@{DB_HOST}:{DB_PORT}\n")

    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )

    try:
        # Insert test data
        insert_dummy_conversations(conn, count=1000)

        # Test performance
        avg_time, p95_time = test_similarity_search(conn, iterations=100)

        # Validate performance targets
        print("\n📊 Performance Targets:")
        print(f"  Target: < 50ms avg query time")
        print(f"  Actual: {avg_time:.2f}ms avg")

        if avg_time < 50:
            print("  ✅ PASS: Performance target met")
        else:
            print(f"  ⚠️  WARN: Performance slower than target (expected < 50ms, got {avg_time:.2f}ms)")
            print("  Consider:")
            print("    - Increasing shared_buffers in postgresql.conf")
            print("    - Adjusting IVFFlat lists parameter")
            print("    - Upgrading hardware (more RAM/faster CPU)")

    finally:
        cleanup(conn)
        conn.close()

    print("\n🎉 Performance validation complete!")

if __name__ == '__main__':
    main()
