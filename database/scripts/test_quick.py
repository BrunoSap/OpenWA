#!/usr/bin/env python3
"""Quick validation test - runs inside Docker network via docker compose exec."""
import sys
import os

# Set defaults for Docker network
os.environ.setdefault('POSTGRES_HOST', 'postgres')
os.environ.setdefault('POSTGRES_PORT', '5432')
os.environ.setdefault('POSTGRES_DB', 'openwa')
os.environ.setdefault('POSTGRES_USER', 'openwa')
os.environ.setdefault('POSTGRES_PASSWORD', '')

# Import and run just the 1000-row test
sys.path.insert(0, os.path.dirname(__file__))

# Monkey-patch the scale test sizes to only run 1000 rows
import validate_performance
validate_performance.SCALE_TEST_SIZES = [1000]
validate_performance.BENCHMARK_ITERATIONS = 100  # Faster for validation

if __name__ == '__main__':
    validate_performance.main()
