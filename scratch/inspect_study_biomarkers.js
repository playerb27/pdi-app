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

const biomarkerId = 'dd16cc3c-d511-44ae-89dc-87323270100f';

async function main() {
  console.log("Fetching the study of the target biomarker...");
  const { data: bm, error: bmErr } = await supabase
    .from('biomarkers')
    .select('study_id, name, value, canonical_name')
    .eq('id', biomarkerId)
    .single();
  if (bmErr) throw bmErr;

  const studyId = bm.study_id;
  console.log(`Biomarker study ID is: ${studyId}`);

  console.log("\nFetching ALL biomarkers for this study...");
  const { data: allBms, error: allBmsErr } = await supabase
    .from('biomarkers')
    .select('*')
    .eq('study_id', studyId);
  if (allBmsErr) throw allBmsErr;

  console.log(`Total biomarkers in this study: ${allBms.length}`);
  
  // Find all biomarkers matching canonical name "Plaquetas"
  const plaquetas = allBms.filter(b => b.canonical_name === 'Plaquetas' || b.name.toLowerCase().includes('plaqueta'));
  console.log("\nBiomarkers related to 'Plaquetas' in this study:");
  plaquetas.forEach(b => {
    console.log(`ID: ${b.id} | Name: "${b.name}" | Canonical: "${b.canonical_name}" | Value: "${b.value}" | Edited: ${b.is_edited}`);
  });
}

main().catch(console.error);
