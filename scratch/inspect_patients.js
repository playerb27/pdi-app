const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://rdenyvmztjbpcrwnqwqb.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZW55dm16dGpicGNyd25xd3FiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM3NzU4MCwiZXhwIjoyMDkzOTUzNTgwfQ.LczS-q3Gvolq5e7axg6wIS6w4ArieFr34dsZCjUCmmM';
const sb = createClient(supabaseUrl, serviceKey);

async function main() {
  const { data, error } = await sb.from('patients').select('id, full_name');
  if (error) {
    console.error('Error fetching patients:', error);
  } else {
    console.log('Patients in database:', data);
  }
}
main();
