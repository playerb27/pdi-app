const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    }
    env[match[1]] = value;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("Listing Buckets...");
  const { data: buckets, error: bError } = await supabase.storage.listBuckets();
  if (bError) console.error("Buckets error:", bError.message);
  else console.log("Buckets:", buckets);
  
  console.log("Checking if table patient_documents exists...");
  const { data, error } = await supabase.from('patient_documents').select('*').limit(1);
  if (error) console.log("patient_documents error:", error.message);
  else console.log("patient_documents table exists!");
}

main();
