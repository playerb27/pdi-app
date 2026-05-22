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

async function main() {
  const patientId = '09cd20ed-7f5c-45df-9158-23a71fec6bc3';
  
  const { data: studies } = await supabase
    .from('studies')
    .select('id, file_name, created_at, biomarkers(*)')
    .eq('patient_id', patientId);

  if (!studies) {
    console.error("No studies found!");
    process.exit(1);
  }

  const plaquetasData = [];

  for (const study of studies) {
    const studyDate = study.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? study.created_at.slice(0, 10);
    for (const bm of (study.biomarkers ?? [])) {
      const canonical = bm.canonical_name ?? '';
      
      if (canonical.toLowerCase().includes('plaqueta') || bm.name.toLowerCase().includes('plaqueta')) {
        plaquetasData.push({
          id: bm.id,
          studyDate,
          rawName: bm.raw_name ?? bm.name,
          name: bm.name,
          canonical_name: bm.canonical_name,
          value: bm.value,
          unit: bm.unit,
          flag: bm.flag,
          is_edited: bm.is_edited,
          original_value: bm.original_value,
          referenceRange: bm.reference_range
        });
      }
    }
  }

  plaquetasData.sort((a, b) => a.studyDate.localeCompare(b.studyDate));

  console.log(`Plaquetas data for Federico Baena Quijano:`);
  for (const entry of plaquetasData) {
    console.log(`ID: ${entry.id} | Date: ${entry.studyDate} | Raw: "${entry.rawName}" | Name: "${entry.name}" | Canonical: "${entry.canonical_name}" | Val: ${entry.value} | Unit: "${entry.unit}" | Flag: ${entry.flag} | Edited: ${entry.is_edited} | Original: "${entry.original_value}"`);
  }
}

main().catch(console.error);
