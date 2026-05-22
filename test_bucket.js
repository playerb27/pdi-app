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
  console.log("Creating bucket 'patient-documents'...");
  const { data, error } = await supabase.storage.createBucket('patient-documents', {
    public: true,
    fileSizeLimit: 52428800 // 50MB
  });
  if (error) {
    console.error("Bucket creation failed/already exists:", error.message);
  } else {
    console.log("Bucket created successfully:", data);
  }

  // List buckets again
  const { data: buckets } = await supabase.storage.listBuckets();
  console.log("Current Buckets:", buckets);
}

main();
