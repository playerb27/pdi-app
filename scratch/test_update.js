const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rdenyvmztjbpcrwnqwqb.supabase.co';
const anonKey = 'sb_publishable_EoAhHcGx5ywJ5U-BC-7LPA_GK04kLuJ';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZW55dm16dGpicGNyd25xd3FiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM3NzU4MCwiZXhwIjoyMDkzOTUzNTgwfQ.LczS-q3Gvolq5e7axg6wIS6w4ArieFr34dsZCjUCmmM';

async function main() {
  const sbAnon = createClient(supabaseUrl, anonKey);
  const sbService = createClient(supabaseUrl, serviceKey);

  console.log('--- FETCHING BIOMARKERS WITH SERVICE KEY ---');
  const { data: bms, error: err } = await sbService.from('biomarkers').select('*').limit(3);
  if (err) {
    console.error('Fetch error (service key):', err);
    return;
  }
  console.log('Fetched biomarkers (service key):', bms);

  if (bms.length === 0) {
    console.log('No biomarkers found.');
    return;
  }

  const testBm = bms[0];
  console.log(`Testing update on biomarker ID: ${testBm.id}, name: ${testBm.name}`);

  console.log('\n--- ATTEMPTING UPDATE WITH ANON KEY (NO AUTH) ---');
  const { data: updateAnon, error: errAnon } = await sbAnon
    .from('biomarkers')
    .update({ value: '200', is_edited: true })
    .eq('id', testBm.id)
    .select();
  console.log('Anon update error:', errAnon);
  console.log('Anon update result:', updateAnon);

  console.log('\n--- ATTEMPTING UPDATE WITH SERVICE KEY ---');
  const { data: updateService, error: errService } = await sbService
    .from('biomarkers')
    .update({ value: testBm.value }) // Revert or write same value to test
    .eq('id', testBm.id)
    .select();
  console.log('Service update error:', errService);
  console.log('Service update result:', updateService);
}

main().catch(console.error);
