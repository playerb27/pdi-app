const path = require('path');
const fs = require('fs');
const http = require('http');
const projectPath = "/Users/federicobq/Library/Mobile Documents/com~apple~CloudDocs/ANTIGRAVITY/PDI protocolo diagnostico integral/pdi-app";
module.paths.push(path.join(projectPath, 'node_modules'));

const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(projectPath, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const biomarkerId = 'dd16cc3c-d511-44ae-89dc-87323270100f';
const patientId = '09cd20ed-7f5c-45df-9158-23a71fec6bc3';

async function getBiomarker() {
  const { data, error } = await supabase
    .from('biomarkers')
    .select('*')
    .eq('id', biomarkerId)
    .single();
  if (error) throw error;
  return data;
}

function postRequest(url, body) {
  return new Promise((resolve, reject) => {
    const dataString = JSON.stringify(body);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/build-canonical',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': dataString.length
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
    });

    req.on('error', (err) => reject(err));
    req.write(dataString);
    req.end();
  });
}

async function main() {
  console.log("1. Fetching biomarker initial state...");
  let bm = await getBiomarker();
  console.log(`Initial: Value=${bm.value}, Flag=${bm.flag}, IsEdited=${bm.is_edited}, OriginalValue=${bm.original_value}`);

  console.log("\n2. Updating biomarker value to '250'...");
  const { error: updateErr } = await supabase
    .from('biomarkers')
    .update({
      value: '250',
      flag: 'Normal',
      is_edited: true,
      original_value: '200000|2026-05-20T20:00:00.000Z'
    })
    .eq('id', biomarkerId);
  if (updateErr) throw updateErr;

  bm = await getBiomarker();
  console.log(`After Update: Value=${bm.value}, Flag=${bm.flag}, IsEdited=${bm.is_edited}, OriginalValue=${bm.original_value}`);

  console.log("\n3. Calling /api/build-canonical via HTTP POST...");
  try {
    const res = await postRequest('http://localhost:3000/api/build-canonical', { patientId });
    console.log("API Response status:", res.statusCode);
    console.log("API Response body:", res.body);
  } catch (err) {
    console.error("HTTP request error:", err.message);
  }

  console.log("\n4. Fetching biomarker state after build-canonical...");
  bm = await getBiomarker();
  console.log(`After Build: Value=${bm.value}, Flag=${bm.flag}, IsEdited=${bm.is_edited}, OriginalValue=${bm.original_value}`);
}

main().catch(console.error);
