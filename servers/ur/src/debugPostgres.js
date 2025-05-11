/**
 * PostgreSQL connection diagnostic script
 * Run this directly to debug database connection issues
 */
import pg from 'pg'
import { URL } from 'url'

// Read variables directly from process.env
const dbUrl = process.env.DB_URL
const usePostgres = process.env.USE_POSTGRES === 'true'
const dbPoolSize = parseInt(process.env.DB_POOL_SIZE || '10')

console.log('===== POSTGRES DIAGNOSTIC TOOL =====')
console.log(`USE_POSTGRES=${process.env.USE_POSTGRES} (parsed as boolean: ${usePostgres})`)
console.log(`DB_URL=${dbUrl ? dbUrl.replace(/:\\/\\/[^:]+:[^@]+@/, '://****:****@') : 'not set'}`)
console.log(`DB_POOL_SIZE=${dbPoolSize}`)

async function diagnosePostgresConnection() {
  if (!usePostgres) {
    console.error('ERROR: USE_POSTGRES is not set to "true"')
    return
  }
  
  if (!dbUrl) {
    console.error('ERROR: DB_URL is not provided')
    return
  }
  
  try {
    console.log('1. Connecting to default database...')
    // First connect to admin database
    const adminPool = new pg.Pool({
      connectionString: dbUrl,
      max: 1
    })
    
    try {
      const adminClient = await adminPool.connect()
      console.log('✓ Successfully connected to admin database')
      
      const infoResult = await adminClient.query(
        'SELECT current_database() as db, current_user as user'
      )
      console.log(`✓ Connected as user: ${infoResult.rows[0].user} to database: ${infoResult.rows[0].db}`)
      
      // Check if ur_metrics database exists
      console.log('2. Checking if ur_metrics database exists...')
      const dbCheckResult = await adminClient.query(
        "SELECT 1 FROM pg_database WHERE datname = 'ur_metrics'"
      )
      
      if (dbCheckResult.rows.length === 0) {
        console.log('✗ ur_metrics database does not exist, attempting to create it...')
        try {
          await adminClient.query('CREATE DATABASE ur_metrics')
          console.log('✓ Created ur_metrics database successfully')
        } catch (createErr) {
          console.error('✗ Failed to create database:', createErr.message)
          console.log('SOLUTION: You need to manually create the ur_metrics database:')
          console.log('Run: createdb ur_metrics')
        }
      } else {
        console.log('✓ ur_metrics database already exists')
      }
      
      adminClient.release()
    } catch (err) {
      console.error('✗ Failed to connect to admin database:', err.message)
      console.log('SOLUTION: Check your DB_URL and ensure PostgreSQL is running')
    } finally {
      await adminPool.end()
    }
    
    // Try connecting to ur_metrics database
    console.log('3. Attempting to connect to ur_metrics database...')
    let metricsDbUrl = dbUrl
    
    try {
      // Parse and modify the URL to connect to ur_metrics
      const parsedUrl = new URL(dbUrl)
      parsedUrl.pathname = '/ur_metrics'
      metricsDbUrl = parsedUrl.toString()
    } catch (err) {
      // Fallback to string replacement if URL parsing fails
      if (dbUrl.includes('/postgres')) {
        metricsDbUrl = dbUrl.replace('/postgres', '/ur_metrics')
      } else {
        metricsDbUrl = `${dbUrl}/ur_metrics`
      }
    }
    
    console.log(`Connecting to: ${metricsDbUrl.replace(/:\\/\\/[^:]+:[^@]+@/, '://****:****@')}`)
    
    const metricsPool = new pg.Pool({
      connectionString: metricsDbUrl,
      max: 1
    })
    
    try {
      const metricsClient = await metricsPool.connect()
      console.log('✓ Successfully connected to ur_metrics database')
      
      // Check if tables exist
      console.log('4. Checking if metrics tables exist...')
      const tablesResult = await metricsClient.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'ur_metrics_%'"
      )
      
      if (tablesResult.rows.length === 0) {
        console.log('✗ No metrics tables found in ur_metrics database')
        console.log('SOLUTION: Tables will be created when the application runs')
      } else {
        console.log('✓ Found existing tables:')
        tablesResult.rows.forEach(row => {
          console.log(`  - ${row.table_name}`)
        })
      }
      
      metricsClient.release()
    } catch (err) {
      console.error('✗ Failed to connect to ur_metrics database:', err.message)
      console.log('SOLUTION: Make sure the ur_metrics database exists')
    } finally {
      await metricsPool.end()
    }
    
    console.log('===== DIAGNOSIS COMPLETE =====')
  } catch (err) {
    console.error('Unexpected error during diagnosis:', err)
  }
}

diagnosePostgresConnection()
