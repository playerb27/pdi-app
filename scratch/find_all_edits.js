const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rdenyvmztjbpcrwnqwqb.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZW55dm16dGpicGNyd25xd3FiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM3NzU4MCwiZXhwIjoyMDkzOTUzNTgwfQ.LczS-q3Gvolq5e7axg6wIS6w4ArieFr34dsZCjUCmmM';

async function main() {
  const sb = createClient(supabaseUrl, serviceKey);

  console.log('--- FINDING ALL EDITED BIOMARKERS IN DB ---');
  const { data, error } = await sb
    .from('biomarkers')
    .select('id, name, value, is_edited, original_value, study_id, studies(patient_id, patients(full_name))')
    .eq('is_edited', true);

  if (error) {
    console.error('Error fetching edits:', error);
    return;
  }

  console.log(`Found ${data.length} edited biomarkers in DB:`);
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);
