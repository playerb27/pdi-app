// Show ALL edited biomarkers and find what happened with Linfocitos 35 save
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
const sb = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);
const patientId = '09cd20ed-7f5c-45df-9158-23a71fec6bc3';

async function main() {
  // Find ALL biomarkers marked is_edited=true
  const { data: studies } = await sb.from('studies').select('id, biomarkers(*)').eq('patient_id', patientId);
  const edited = [];
  for (const s of studies) {
    for (const b of (s.biomarkers || [])) {
      if (b.is_edited) edited.push({ ...b, study_id: s.id });
    }
  }
  console.log(`\n=== ALL is_edited=true biomarkers (${edited.length} total) ===`);
  for (const b of edited) {
    console.log(`  name:"${b.name}" value:"${b.value}" original:"${b.original_value}" study:${b.study_id.substring(0,8)}`);
  }

  // Check the specific Linfocitos 1435 biomarker
  const { data: linf } = await sb.from('biomarkers').select('*').eq('id', 'd4ce934e-0000-0000-0000-000000000000').maybeSingle();
  console.log('\nDirect lookup d4ce934e:', linf ? `value=${linf.value} is_edited=${linf.is_edited}` : 'not found (need full UUID)');

  // Get the full Linfocitos 1435 biomarker
  const { data: l2 } = await sb.from('biomarkers').select('*').ilike('name', 'Linfocitos').eq('value', '1435');
  console.log('\nLinfocitos with value=1435:', l2?.length, 'rows');
  for (const b of (l2 || [])) {
    console.log(`  id:${b.id} value:${b.value} is_edited:${b.is_edited} canonical:${b.canonical_name}`);
  }

  // FIX: Update the 1435 biomarker to mark it as the absolute count with a separate canonical name
  console.log('\n=== APPLYING FIX ===');
  if (l2 && l2.length > 0) {
    for (const b of l2) {
      const { error } = await sb.from('biomarkers').update({ 
        canonical_name: 'Linfocitos Absolutos',
        name: 'Linfocitos Absolutos'
      }).eq('id', b.id);
      if (error) console.log(`  ERROR fixing ${b.id}: ${error.message}`);
      else console.log(`  ✅ Fixed: Renamed to "Linfocitos Absolutos" (was "Linfocitos" with value 1435)`);
    }
  }

  // Also fix all LINFOCITOS ABSOLUTOS and MONOCITOS ABSOLUTOS canonical names
  const { data: absolutos } = await sb.from('biomarkers').select('id, name, canonical_name, study_id')
    .ilike('name', '% ABSOLUTOS').in('study_id',  studies.map(s => s.id));
  
  console.log(`\nFound ${absolutos?.length} "ABSOLUTOS" biomarkers to fix:`);
  for (const b of (absolutos || [])) {
    const newCanonical = b.canonical_name ? b.canonical_name.replace(/^(.+)$/, '$1 Absolutos') : b.name;
    // Only update if canonical doesn't already end in Absolutos
    if (b.canonical_name && !b.canonical_name.includes('Absolutos')) {
      const { error } = await sb.from('biomarkers').update({ canonical_name: newCanonical }).eq('id', b.id);
      if (error) console.log(`  ERROR: ${error.message}`);
      else console.log(`  ✅ "${b.name}": "${b.canonical_name}" → "${newCanonical}"`);
    } else {
      console.log(`  SKIP "${b.name}": already has "${b.canonical_name}"`);
    }
  }

  console.log('\nDone. Reload the page to see the fix.');
}

main().catch(console.error);
