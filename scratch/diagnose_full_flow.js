const path = require('path');
const fs = require('fs');
const projectPath = "/Users/federicobq/Library/Mobile Documents/com~apple~CloudDocs/ANTIGRAVITY/PDI protocolo diagnostico integral/pdi-app";
module.paths.push(path.join(projectPath, 'node_modules'));
const { createClient } = require('@supabase/supabase-js');
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (match) envVars[match[1].trim()] = match[2].trim();
});
const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

const patientId = '09cd20ed-7f5c-45df-9158-23a71fec6bc3';

async function main() {
  console.log("=== DIAGNÓSTICO COMPLETO DEL FLUJO DE DATOS ===\n");
  
  // 1. Fetch exact same query as getStudiesWithBiomarkers
  console.log("1. Fetching studies (same query as app)...");
  const { data: studies } = await supabase
    .from('studies')
    .select('*, biomarkers(*)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });
  
  console.log(`   Found ${studies.length} studies\n`);
  
  // 2. Find all Plaquetas biomarkers
  console.log("2. ALL Plaquetas biomarkers across all studies:");
  for (const s of studies) {
    const plaquetas = (s.biomarkers || []).filter(b => 
      b.canonical_name === 'Plaquetas' || 
      (b.name || '').toLowerCase().includes('plaqueta')
    );
    if (plaquetas.length > 0) {
      console.log(`\n   Study created: ${s.created_at}`);
      for (const p of plaquetas) {
        console.log(`   - ID: ${p.id}`);
        console.log(`     name: "${p.name}"`);
        console.log(`     value: "${p.value}"`);
        console.log(`     is_edited: ${p.is_edited}`);
        console.log(`     original_value: "${p.original_value}"`);
        console.log(`     canonical_name: "${p.canonical_name}"`);
        console.log(`     flag: "${p.flag}"`);
      }
    }
  }
  
  // 3. Check if canonical build record is stale
  console.log("\n3. Checking canonical build records...");
  const { data: builds } = await supabase
    .from('canonical_builds')
    .select('*')
    .eq('patient_id', patientId)
    .order('built_at', { ascending: false })
    .limit(3);
  
  if (builds && builds.length > 0) {
    for (const b of builds) {
      console.log(`   Built at: ${b.built_at}, method: ${b.method}, studies: ${JSON.stringify(b.study_ids)}`);
    }
    const builtIds = builds[0].study_ids || [];
    const currentIds = studies.map(s => s.id);
    const isStale = currentIds.some(id => !builtIds.includes(id));
    console.log(`\n   Current study IDs: ${JSON.stringify(currentIds)}`);
    console.log(`   Latest build study IDs: ${JSON.stringify(builtIds)}`);
    console.log(`   Status: ${isStale ? '⚠️ STALE - will trigger autoBuildCanonical!' : '✅ upToDate'}`);
  }
}

main().catch(console.error);
