// Test: Can the ANON KEY actually UPDATE a biomarker's value in the DB?
// This simulates EXACTLY what the app does when a user saves an edit.

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

// Use ANON KEY (same as the client browser)
const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const patientId = '09cd20ed-7f5c-45df-9158-23a71fec6bc3';

async function main() {
  console.log("=== TESTING updateBiomarker WITH ANON KEY ===\n");
  
  // Step 1: Get ALL biomarkers for this patient (find any one we can test with)
  const { data: studies, error: studiesErr } = await supabase
    .from('studies')
    .select('id, biomarkers(id, name, value, is_edited, flag)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });
  
  if (studiesErr) {
    console.log("ERROR fetching studies:", studiesErr.message);
    return;
  }
  
  // Find a biomarker to test (pick first one from latest study)
  const latestStudy = studies[0];
  const testBiomarker = latestStudy?.biomarkers?.[0];
  
  if (!testBiomarker) {
    console.log("No biomarkers found to test");
    return;
  }
  
  console.log(`Testing with biomarker: "${testBiomarker.name}"`);
  console.log(`  ID: ${testBiomarker.id}`);
  console.log(`  Current value: "${testBiomarker.value}"`);
  console.log(`  Is edited: ${testBiomarker.is_edited}`);
  
  // Step 2: Try to update it (EXACTLY as the app does)
  const testValue = testBiomarker.value + "_TEST";
  console.log(`\nAttempting to update value to: "${testValue}"...`);
  
  const { data: updateData, error: updateError } = await supabase
    .from('biomarkers')
    .update({ 
      value: testValue, 
      flag: testBiomarker.flag,
      is_edited: true 
    })
    .eq('id', testBiomarker.id)
    .select(); // Add .select() to see what was actually updated
  
  if (updateError) {
    console.log("\n❌ UPDATE FAILED!");
    console.log("Error:", updateError.message);
    console.log("Code:", updateError.code);
    console.log("Details:", updateError.details);
    console.log("Hint:", updateError.hint);
    console.log("\n→ This is the bug! The anon key cannot update biomarkers.");
    console.log("→ Fix: Add RLS policy to allow UPDATE, OR use a server-side API route.");
  } else {
    console.log(`\n✅ Update response rows returned: ${updateData?.length ?? 0}`);
    if (updateData?.length === 0) {
      console.log("⚠️  WARNING: Update ran but affected 0 rows!");
      console.log("→ This means the RLS policy filtered out the row silently.");
      console.log("→ The bug: update appears to succeed but nothing changed in DB.");
    }
    
    // Step 3: Verify by re-reading
    const { data: verifyData } = await supabase
      .from('biomarkers')
      .select('id, name, value, is_edited')
      .eq('id', testBiomarker.id)
      .single();
    
    if (verifyData?.value === testValue) {
      console.log(`✅ VERIFIED: Value is now "${verifyData.value}" in DB`);
      console.log("→ The DB update IS working. Bug must be elsewhere.");
      
      // Restore original value
      await supabase.from('biomarkers').update({ value: testBiomarker.value, is_edited: testBiomarker.is_edited }).eq('id', testBiomarker.id);
      console.log(`✅ Restored original value: "${testBiomarker.value}"`);
    } else {
      console.log(`❌ VERIFY FAILED: Value is still "${verifyData?.value}" (expected "${testValue}")`);
      console.log("→ THE BUG: RLS policy returns success but doesn't actually update!");
      console.log("→ This is exactly why edits revert on page reload.");
    }
  }
  
  // Step 4: Check RLS policies
  console.log("\n=== CHECKING WITH SERVICE ROLE KEY ===");
  const sbService = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);
  
  const { data: serviceUpdate, error: serviceErr } = await sbService
    .from('biomarkers')
    .update({ value: "SERVICE_TEST", is_edited: true })
    .eq('id', testBiomarker.id)
    .select();
  
  if (serviceErr) {
    console.log("Service role update ERROR:", serviceErr.message);
  } else {
    console.log(`Service role update: ${serviceUpdate?.length ?? 0} rows affected`);
    
    // Verify
    const { data: sv } = await sbService.from('biomarkers').select('value').eq('id', testBiomarker.id).single();
    console.log(`Service role verified value: "${sv?.value}"`);
    
    // Restore
    await sbService.from('biomarkers').update({ value: testBiomarker.value, is_edited: testBiomarker.is_edited }).eq('id', testBiomarker.id);
    console.log("Restored original value via service role");
  }
}

main().catch(console.error);
