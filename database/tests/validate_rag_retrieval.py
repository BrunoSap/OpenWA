#!/usr/bin/env python3
"""
RAG Retrieval Quality Validation (RAG-08)

Measures precision@k and recall@k for pgvector semantic search using
a golden dataset of annotated queries with known relevant documents.

Usage:
  python database/tests/validate_rag_retrieval.py

Requirements:
  - PostgreSQL with pgvector extension
  - knowledge.faq table seeded with test FAQs
  - Golden dataset: database/tests/fixtures/rag_golden_dataset.json
"""

import json
import os
import sys
import psycopg2
import numpy as np
from typing import List, Tuple

def load_golden_dataset(path: str) -> List[dict]:
    """Load annotated queries with known relevant doc IDs"""
    with open(path, 'r') as f:
        return json.load(f)

def calculate_precision_at_k(
    retrieved_ids: List[int],
    relevant_ids: List[int],
    k: int
) -> float:
    """Precision@k: fraction of top-k retrieved docs that are relevant"""
    retrieved_top_k = retrieved_ids[:k]
    relevant_set = set(relevant_ids)
    relevant_retrieved = len([id for id in retrieved_top_k if id in relevant_set])
    return relevant_retrieved / k if k > 0 else 0.0

def calculate_recall_at_k(
    retrieved_ids: List[int],
    relevant_ids: List[int],
    k: int
) -> float:
    """Recall@k: fraction of relevant docs that appear in top-k results"""
    retrieved_top_k_set = set(retrieved_ids[:k])
    relevant_set = set(relevant_ids)
    relevant_retrieved = len(retrieved_top_k_set & relevant_set)
    return relevant_retrieved / len(relevant_set) if relevant_set else 0.0

def test_rag_precision_at_k():
    """RAG-08: Measure precision@k and recall@k for semantic search"""
    conn = psycopg2.connect(
        dbname=os.getenv('PGDATABASE', os.getenv('POSTGRES_DB', 'openwa')),
        user=os.getenv('PGUSER', os.getenv('POSTGRES_USER', 'openwa')),
        host=os.getenv('PGHOST', os.getenv('POSTGRES_HOST', 'localhost')),
        port=int(os.getenv('PGPORT', os.getenv('POSTGRES_PORT', '5432'))),
        password=os.getenv('PGPASSWORD', os.getenv('POSTGRES_PASSWORD', ''))
    )
    cursor = conn.cursor()

    golden_dataset = load_golden_dataset(
        'database/tests/fixtures/rag_golden_dataset.json'
    )

    precision_scores = []
    recall_scores = []

    for item in golden_dataset:
        query_embedding = item['query_embedding']
        relevant_ids = item['relevant_doc_ids']

        # Execute pgvector similarity search (RAG-02)
        cursor.execute("""
            SELECT id, 1 - (embedding <=> %s::vector) AS similarity
            FROM knowledge.faq
            WHERE category = 'test_rag_cycle' AND embedding IS NOT NULL
            ORDER BY embedding <=> %s::vector
            LIMIT 5
        """, (query_embedding, query_embedding))

        retrieved_ids = [row[0] for row in cursor.fetchall()]

        # Calculate precision@5 and recall@5
        precision = calculate_precision_at_k(retrieved_ids, relevant_ids, 5)
        recall = calculate_recall_at_k(retrieved_ids, relevant_ids, 5)

        precision_scores.append(precision)
        recall_scores.append(recall)

        print(f"Query: {item['query'][:50]}...")
        print(f"  Retrieved IDs: {retrieved_ids}")
        print(f"  Relevant IDs: {relevant_ids}")
        print(f"  Precision@5: {precision:.2f}")
        print(f"  Recall@5: {recall:.2f}")

    avg_precision = np.mean(precision_scores)
    avg_recall = np.mean(recall_scores)

    print(f"\n=== RAG Retrieval Quality Metrics ===")
    print(f"Samples: {len(golden_dataset)}")
    print(f"Average Precision@5: {avg_precision:.2f}")
    print(f"Average Recall@5: {avg_recall:.2f}")

    # RAG-08: Assert precision@5 >= 0.8
    assert avg_precision >= 0.8, f"Precision@5 too low: {avg_precision:.2f}"

    print(f"\n✅ RAG-08 PASSED: Precision@5 >= 0.8")

    cursor.close()
    conn.close()

if __name__ == '__main__':
    test_rag_precision_at_k()
