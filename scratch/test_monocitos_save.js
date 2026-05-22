// Simulate EXACTLY what happens when user saves "1" for Monocitos in ExpandedChartModal
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

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// The Monocitos biomarker from the 2026-04-27 study (value: 164)
const MONOCITOS_ID = '04d62785-b1aa-4698-a69e-5b537fc505fc';

async function main() {
  console.log("=== SIMULATING: User edits Monocitos from 164 → 1 ===\n");
  
  // Read current value
  const { data: before } = await supabase.from('biomarkers').select('*').eq('id', MONOCITOS_ID).single();
  console.log(`BEFORE: value="${before.value}", is_edited=${before.is_edited}`);
  
  // Simulate updateBiomarker() exactly as the app calls it
  const cleanOrig = String(before.value).split('|')[0];
  const timestamp = new Date().toISOString();
  const payload = {
    value: "1",
    flag: "Bajo",
    is_edited: true,
    original_value: `${cleanOrig}|${timestamp}`
  };
  
  console.log("\nCalling update with payload:", JSON.stringify(payload, null, 2));
  
  const { error } = await supabase.from('biomarkers').update(payload).eq('id', MONOCITOS_ID);
  
  if (error) {
    console.log("\n❌ UPDATE FAILED:", error.message);
    return;
  }
  
  // Verify immediately
  const { data: after } = await supabase.from('biomarkers').select('*').eq('id', MONOCITOS_ID).single();
  console.log(`\nAFTER update: value="${after.value}", is_edited=${after.is_edited}`);
  
  if (after.value === "1") {
    console.log("\n✅ DB UPDATE SUCCEEDED — value is now '1'");
    console.log("\nNow simulating what loadStudies() would return on page refresh...");
    
    // Simulate the loadStudies fetch
    const { data: studies } = await supabase
      .from('studies')
      .select('*, biomarkers(*)')
      .eq('patient_id', '09cd20ed-7f5c-45df-9158-23a71fec6bc3')
      .order('created_at', { ascending: false });
    
    // Find Monocitos in ALL studies
    let foundEdited = false;
    for (const study of studies) {
      const m = (study.biomarkers || []).find(b => b.id === MONOCITOS_ID);
      if (m) {
        console.log(`\nStudy ${study.id.substring(0,8)}: Monocitos value="${m.value}", is_edited=${m.is_edited}`);
        if (m.value === "1") foundEdited = true;
      }
    }
    
    if (foundEdited) {
      console.log("\n✅ After page refresh, the value WOULD be '1' from DB.");
      console.log("→ The DB is fine. The bug is in the UI display logic.");
    } else {
      console.log("\n❌ After page refresh, the value '1' is NOT showing!");
      console.log("→ Something is overwriting the value.");
    }
  } else {
    console.log(`\n❌ VERIFY FAILED: Still showing "${after.value}"`);
  }
  
  // Restore
  await supabase.from('biomarkers').update({ value: "164", is_edited: false, original_value: null, flag: 'Alto' }).eq('id', MONOCITOS_ID);
  console.log("\nRestored to original value '164'");
}

main().catch(console.error);
