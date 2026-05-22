const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rdenyvmztjbpcrwnqwqb.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZW55dm16dGpicGNyd25xd3FiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM3NzU4MCwiZXhwIjoyMDkzOTUzNTgwfQ.LczS-q3Gvolq5e7axg6wIS6w4ArieFr34dsZCjUCmmM';

async function main() {
  const sb = createClient(supabaseUrl, serviceKey);

  console.log('Fetching patients...');
  const { data: patients, error: pErr } = await sb.from('patients').select('id, full_name');
  if (pErr) {
    console.error('Error fetching patients:', pErr);
    return;
  }
  console.log('Patients:', patients);

  for (const patient of patients) {
    console.log(`\n================ PATIENT: ${patient.full_name} (${patient.id}) ================`);
    const { data: studies, error: sErr } = await sb
      .from('studies')
      .select('id, file_name, created_at, biomarkers(*)')
      .eq('patient_id', patient.id);
    
    if (sErr) {
      console.error(`Error fetching studies for ${patient.full_name}:`, sErr);
      continue;
    }

    console.log(`Studies count: ${studies.length}`);
    for (const study of studies) {
      console.log(`- Study ID: ${study.id}, File: ${study.file_name}, Created At: ${study.created_at}`);
      console.log(`  Biomarkers count: ${study.biomarkers?.length}`);
      // Find edited biomarkers or some specific ones (e.g. Plaquetas)
      const edited = study.biomarkers?.filter(b => b.is_edited);
      if (edited && edited.length > 0) {
        console.log(`  Edited biomarkers:`, edited.map(b => ({
          id: b.id,
          name: b.name,
          value: b.value,
          is_edited: b.is_edited,
          original_value: b.original_value
        })));
      }
      const plaquetas = study.biomarkers?.filter(b => b.name.toLowerCase().includes('plaqueta') || b.canonical_name?.toLowerCase().includes('plaqueta'));
      if (plaquetas && plaquetas.length > 0) {
        console.log(`  Plaquetas biomarkers:`, plaquetas.map(b => ({
          id: b.id,
          name: b.name,
          value: b.value,
          is_edited: b.is_edited,
          original_value: b.original_value,
          canonical_name: b.canonical_name
        })));
      }
    }
  }
}

main().catch(console.error);
