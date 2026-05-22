const path = require('path');
const fs = require('fs');
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

const patientId = '09cd20ed-7f5c-45df-9158-23a71fec6bc3';

async function main() {
  console.log("Fetching studies with biomarkers using same query as client...");
  const { data: studies, error } = await supabase
    .from('studies')
    .select('*, biomarkers(*)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching:", error.message);
    return;
  }

  console.log(`Fetched ${studies.length} studies.`);
  for (const s of studies) {
    console.log(`\nStudy Date: ${s.study_date} | Created At: ${s.created_at} | ID: ${s.id}`);
    const plaquetas = s.biomarkers.filter(b => b.canonical_name === 'Plaquetas');
    for (const p of plaquetas) {
      console.log(`  - Biomarker ID: ${p.id}`);
      console.log(`    Name: "${p.name}"`);
      console.log(`    Raw Name: "${p.raw_name}"`);
      console.log(`    Canonical Name: "${p.canonical_name}"`);
      console.log(`    Value: "${p.value}" (type: ${typeof p.value})`);
      console.log(`    Flag: "${p.flag}"`);
      console.log(`    Is Edited: ${p.is_edited}`);
      console.log(`    Original Value: "${p.original_value}"`);
    }
  }
}

main().catch(console.error);
