#!/usr/bin/env node
/**
 * database/scripts/helper_functions_client.js
 * Application layer integration for helper functions
 *
 * Demonstrates:
 * - Proper parameterized queries (no SQL injection)
 * - Connection pooling
 * - Error handling
 * - Rate limit handling
 * - Retry logic
 * - Performance monitoring
 * - Integration with N8N/WhatsApp workflows
 */

const { Pool } = require('pg');

// Database connection pool
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'openwa',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  max: 10, // Max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/**
 * Find similar FAQ entries
 * @param {number[]} embedding - 1536-dimensional embedding vector
 * @param {number} threshold - Similarity threshold (0-1)
 * @param {number} limit - Max results
 * @param {number} offset - Pagination offset
 * @returns {Promise<Array>} Similar FAQ entries
 */
async function findSimilarFaq(embedding, threshold = 0.8, limit = 3, offset = 0) {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    // Validate inputs
    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      throw new Error(`Invalid embedding: expected 1536 dimensions, got ${embedding?.length}`);
    }

    if (threshold < 0 || threshold > 1) {
      throw new Error(`Invalid threshold: expected 0-1, got ${threshold}`);
    }

    if (limit <= 0 || limit > 100) {
      throw new Error(`Invalid limit: expected 1-100, got ${limit}`);
    }

    // Convert embedding to PostgreSQL vector format
    const embeddingStr = `[${embedding.join(',')}]`;

    // Call function with parameterized query
    const result = await client.query(
      'SELECT * FROM knowledge.find_similar_faq($1::vector, $2, $3, $4)',
      [embeddingStr, threshold, limit, offset]
    );

    const elapsed = Date.now() - startTime;
    console.log(`✅ find_similar_faq completed in ${elapsed}ms (${result.rows.length} results)`);

    return result.rows;

  } catch (error) {
    const elapsed = Date.now() - startTime;

    // Handle rate limit errors
    if (error.code === '53400') {
      console.error(`⚠️  Rate limit exceeded: ${error.message}`);
      throw new Error('RATE_LIMIT_EXCEEDED');
    }

    // Handle validation errors
    if (error.code === '22003' || error.code === '22004' || error.code === '22023') {
      console.error(`❌ Validation error: ${error.message}`);
      throw new Error(`VALIDATION_ERROR: ${error.message}`);
    }

    console.error(`❌ find_similar_faq failed after ${elapsed}ms:`, error.message);
    throw error;

  } finally {
    client.release();
  }
}

/**
 * Find similar conversations
 * @param {number[]} embedding - 1536-dimensional embedding vector
 * @param {string} excludeChatId - Chat ID to exclude
 * @param {number} threshold - Similarity threshold
 * @param {number} limit - Max results
 * @param {number} offset - Pagination offset
 * @returns {Promise<Array>} Similar conversations
 */
async function findSimilarConversations(
  embedding,
  excludeChatId = null,
  threshold = 0.8,
  limit = 5,
  offset = 0
) {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    // Validate inputs
    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      throw new Error(`Invalid embedding: expected 1536 dimensions, got ${embedding?.length}`);
    }

    if (excludeChatId && !/^[0-9]+(@.+)?$/.test(excludeChatId)) {
      throw new Error(`Invalid chat_id format: ${excludeChatId}`);
    }

    const embeddingStr = `[${embedding.join(',')}]`;

    const result = await client.query(
      'SELECT * FROM knowledge.find_similar_conversations($1::vector, $2, $3, $4, $5)',
      [embeddingStr, excludeChatId, threshold, limit, offset]
    );

    const elapsed = Date.now() - startTime;
    console.log(`✅ find_similar_conversations completed in ${elapsed}ms (${result.rows.length} results)`);

    return result.rows;

  } catch (error) {
    const elapsed = Date.now() - startTime;

    if (error.code === '53400') {
      console.error(`⚠️  Rate limit exceeded: ${error.message}`);
      throw new Error('RATE_LIMIT_EXCEEDED');
    }

    console.error(`❌ find_similar_conversations failed after ${elapsed}ms:`, error.message);
    throw error;

  } finally {
    client.release();
  }
}

/**
 * Get complete client summary
 * @param {string} chatId - WhatsApp chat ID
 * @param {number} messageLimit - Max recent messages
 * @param {number} messageOffset - Pagination offset
 * @param {boolean} enableAudit - Enable audit logging
 * @returns {Promise<Object>} Client summary JSON
 */
async function getClientSummary(
  chatId,
  messageLimit = 10,
  messageOffset = 0,
  enableAudit = true
) {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    // Validate chat_id format
    if (!chatId || !/^[0-9]+(@.+)?$/.test(chatId)) {
      throw new Error(`Invalid chat_id format: ${chatId}`);
    }

    const result = await client.query(
      'SELECT knowledge.get_client_summary($1, $2, $3, $4) as summary',
      [chatId, messageLimit, messageOffset, enableAudit]
    );

    const elapsed = Date.now() - startTime;
    const summary = result.rows[0]?.summary;

    if (summary?.error) {
      console.error(`❌ get_client_summary returned error: ${summary.error}`);
      throw new Error(summary.error);
    }

    console.log(`✅ get_client_summary completed in ${elapsed}ms`);
    return summary;

  } catch (error) {
    const elapsed = Date.now() - startTime;

    if (error.code === '53400') {
      console.error(`⚠️  Rate limit exceeded: ${error.message}`);
      throw new Error('RATE_LIMIT_EXCEEDED');
    }

    if (error.code === '02000') {
      console.error(`❌ Client not found: ${chatId}`);
      throw new Error(`CLIENT_NOT_FOUND: ${chatId}`);
    }

    console.error(`❌ get_client_summary failed after ${elapsed}ms:`, error.message);
    throw error;

  } finally {
    client.release();
  }
}

/**
 * Calculate attorney fees
 * @param {number} estimatedBackpay - Estimated backpay amount
 * @param {number} monthlyBenefit - Monthly benefit amount
 * @param {number} estimatedUads - Number of UADs
 * @param {string} configVersion - Fee config version
 * @returns {Promise<Object>} Fee calculation result
 */
async function calculateFees(
  estimatedBackpay,
  monthlyBenefit,
  estimatedUads = 60,
  configVersion = '2025-q1'
) {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    // Validate inputs
    if (estimatedBackpay < 0) {
      throw new Error(`Invalid backpay: must be >= 0, got ${estimatedBackpay}`);
    }

    if (monthlyBenefit < 0) {
      throw new Error(`Invalid monthly benefit: must be >= 0, got ${monthlyBenefit}`);
    }

    if (estimatedUads < 0 || estimatedUads > 1000) {
      throw new Error(`Invalid UADs: must be 0-1000, got ${estimatedUads}`);
    }

    const result = await client.query(
      'SELECT knowledge.calculate_fees($1, $2, $3, $4) as fees',
      [estimatedBackpay, monthlyBenefit, estimatedUads, configVersion]
    );

    const elapsed = Date.now() - startTime;
    const fees = result.rows[0]?.fees;

    if (fees?.error) {
      console.error(`❌ calculate_fees returned error: ${fees.error}`);
      throw new Error(fees.error);
    }

    console.log(`✅ calculate_fees completed in ${elapsed}ms (total: R$ ${fees.total})`);
    return fees;

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ calculate_fees failed after ${elapsed}ms:`, error.message);
    throw error;

  } finally {
    client.release();
  }
}

/**
 * Retry wrapper for rate-limited functions
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Max retry attempts
 * @param {number} delayMs - Delay between retries
 * @returns {Promise<any>} Function result
 */
async function retryWithBackoff(fn, maxRetries = 3, delayMs = 1000) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (error.message === 'RATE_LIMIT_EXCEEDED' && attempt < maxRetries) {
        const delay = delayMs * Math.pow(2, attempt - 1);  // Exponential backoff
        console.warn(`⏳ Rate limited, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

/**
 * Example: Integration with N8N webhook
 * Simulates WhatsApp message handling with RAG
 */
async function handleWhatsAppMessage(chatId, messageText, userEmbedding) {
  console.log(`\n📱 Handling WhatsApp message from ${chatId}`);
  console.log(`   Message: "${messageText.substring(0, 50)}..."`);

  try {
    // 1. Try to find similar FAQ (Layer 1 matching)
    const faqResults = await retryWithBackoff(() =>
      findSimilarFaq(userEmbedding, 0.85, 3)
    );

    if (faqResults.length > 0) {
      console.log(`   ✅ Found ${faqResults.length} similar FAQ entries`);
      return {
        source: 'faq',
        answers: faqResults,
      };
    }

    // 2. Try similar conversations from other clients (Layer 2 matching)
    const convResults = await retryWithBackoff(() =>
      findSimilarConversations(userEmbedding, chatId, 0.8, 5)
    );

    if (convResults.length > 0) {
      console.log(`   ✅ Found ${convResults.length} similar conversations`);
      return {
        source: 'conversations',
        conversations: convResults,
      };
    }

    // 3. Get client context for personalized response
    const clientSummary = await retryWithBackoff(() =>
      getClientSummary(chatId, 10, 0, true)
    );

    console.log(`   ✅ Retrieved client summary (${clientSummary.recent_messages.length} messages)`);

    return {
      source: 'client_context',
      summary: clientSummary,
    };

  } catch (error) {
    console.error(`   ❌ Error handling message: ${error.message}`);
    throw error;
  }
}

/**
 * Example: Calculate fees for a case
 */
async function exampleCalculateFees() {
  console.log('\n💰 Calculating fees for example case...');

  try {
    const fees = await calculateFees(
      50000,   // R$ 50k backpay
      3000,    // R$ 3k monthly
      80       // 80 UADs
    );

    console.log('   Fee breakdown:');
    console.log(`   - Atrasados (30%): R$ ${fees.atrasados_30_percent}`);
    console.log(`   - Vincendas (30%): R$ ${fees.vincendas_30_percent}`);
    console.log(`   - UADs: R$ ${fees.uads_total}`);
    console.log(`   - Total: R$ ${fees.total}`);
    console.log(`   - Parcelamento: 10x R$ ${fees.parcelamento_options['10x']} ou 15x R$ ${fees.parcelamento_options['15x']}`);

    return fees;

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    throw error;
  }
}

/**
 * Health check / smoke test
 */
async function healthCheck() {
  console.log('\n🏥 Running health check...');

  try {
    const client = await pool.connect();

    // Check if functions exist
    const result = await client.query(`
      SELECT COUNT(*) as count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'knowledge'
        AND p.proname IN (
          'find_similar_faq',
          'find_similar_conversations',
          'get_client_summary',
          'calculate_fees'
        )
    `);

    const functionCount = parseInt(result.rows[0].count);

    if (functionCount === 4) {
      console.log('   ✅ All 4 helper functions are available');
    } else {
      console.error(`   ❌ Expected 4 functions, found ${functionCount}`);
      throw new Error('Missing helper functions');
    }

    // Check if config table exists
    const configResult = await client.query(`
      SELECT COUNT(*) as count
      FROM knowledge.fee_config
      WHERE config_version = '2025-q1'
    `);

    if (parseInt(configResult.rows[0].count) > 0) {
      console.log('   ✅ Fee config table is populated');
    } else {
      console.error('   ❌ Fee config table is empty or missing default config');
    }

    client.release();
    console.log('   ✅ Health check passed');
    return true;

  } catch (error) {
    console.error(`   ❌ Health check failed: ${error.message}`);
    return false;
  }
}

/**
 * Cleanup and shutdown
 */
async function shutdown() {
  console.log('\n👋 Shutting down...');
  await pool.end();
  console.log('   ✅ Connection pool closed');
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];

  (async () => {
    try {
      if (command === 'health') {
        await healthCheck();
      } else if (command === 'calculate-fees') {
        await exampleCalculateFees();
      } else if (command === 'test') {
        // Generate random embedding for testing
        const testEmbedding = Array.from({ length: 1536 }, () => Math.random() - 0.5);
        await handleWhatsAppMessage('5511999999999@c.us', 'Preciso de ajuda com meu benefício', testEmbedding);
      } else {
        console.log('Usage:');
        console.log('  node helper_functions_client.js health          # Run health check');
        console.log('  node helper_functions_client.js calculate-fees  # Calculate example fees');
        console.log('  node helper_functions_client.js test            # Test message handling');
      }

      await shutdown();
      process.exit(0);

    } catch (error) {
      console.error('\n❌ Fatal error:', error);
      await shutdown();
      process.exit(1);
    }
  })();
}

// Export for use in other modules
module.exports = {
  findSimilarFaq,
  findSimilarConversations,
  getClientSummary,
  calculateFees,
  retryWithBackoff,
  handleWhatsAppMessage,
  healthCheck,
  shutdown,
};
