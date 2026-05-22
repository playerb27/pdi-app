// Simulates exactly what loadStudies() does — checks the value returned AFTER page reload
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

// Use ANON key (like the client does), not service role
const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const patientId = '09cd20ed-7f5c-45df-9158-23a71fec6bc3';

async function main() {
  console.log("=== SIMULANDO EXACTAMENTE loadStudies() ===\n");
  console.log("Using ANON KEY (same as client-side code)\n");
  
  // Exact same query as getStudiesWithBiomarkers
  const { data: studies, error } = await supabase
    .from('studies')
    .select('*, biomarkers(*)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) {
    console.log("ERROR:", error.message);
    return;
  }
  
  console.log(`Found ${studies.length} studies`);
  
  // Find ALL Plaquetas biomarkers
  for (const s of studies) {
    const plaquetas = (s.biomarkers || []).filter(b => 
      (b.canonical_name || '').toLowerCase().includes('plaqueta') ||
      (b.name || '').toLowerCase().includes('plaqueta') ||
      (b.name || '').toLowerCase().includes('cuenta de plaqueta')
    );
    if (plaquetas.length > 0) {
      console.log(`\nStudy ID: ${s.id}`);
      console.log(`Study created_at: ${s.created_at}`);
      for (const p of plaquetas) {
        console.log(`  Biomarker: "${p.name}"`);
        console.log(`  ID: ${p.id}`);
        console.log(`  value: "${p.value}"  ← THIS IS WHAT SHOWS IN THE TABLE`);
        console.log(`  is_edited: ${p.is_edited}`);
        console.log(`  original_value: "${p.original_value}"`);
        console.log(`  canonical_name: "${p.canonical_name}"`);
      }
    }
  }
  
  console.log("\n=== CHECKING getCanonicalBuildStatus ===\n");
  const studyIds = studies.map(s => s.id);
  
  const { data: buildData } = await supabase
    .from('canonical_builds')
    .select('*')
    .eq('patient_id', patientId)
    .order('built_at', { ascending: false })
    .limit(1);
  
  if (!buildData || buildData.length === 0) {
    console.log("Status: NONE - would trigger autoBuildCanonical!");
    return;
  }
  
  const build = buildData[0];
  const builtIds = build.study_ids || [];
  const isStale = studyIds.some(id => !builtIds.includes(id));
  
  console.log(`Latest build: ${build.built_at}`);
  console.log(`Current IDs: ${JSON.stringify(studyIds.sort())}`);
  console.log(`Built IDs:   ${JSON.stringify(builtIds.sort())}`);
  console.log(`Status: ${isStale ? '⚠️ STALE - autoBuildCanonical WILL RUN!' : '✅ upToDate - autoBuildCanonical will NOT run'}`);
}

main().catch(console.error);
