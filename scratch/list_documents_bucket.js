const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rdenyvmztjbpcrwnqwqb.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZW55dm16dGpicGNyd25xd3FiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM3NzU4MCwiZXhwIjoyMDkzOTUzNTgwfQ.LczS-q3Gvolq5e7axg6wIS6w4ArieFr34dsZCjUCmmM';

async function main() {
  const sb = createClient(supabaseUrl, serviceKey);

  console.log('Listing patient-documents bucket...');
  
  // List folders in bucket
  const { data: files, error } = await sb.storage.from('patient-documents').list('', {
    limit: 100,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' }
  });

  if (error) {
    console.error('Error listing root bucket:', error);
    return;
  }

  console.log('Root folders/files in bucket patient-documents:', files);

  for (const item of files) {
    if (item.id === null) {
      // It's a folder, list its contents
      console.log(`\nListing contents of folder: ${item.name}`);
      const { data: subFiles, error: subError } = await sb.storage.from('patient-documents').list(item.name, {
        limit: 100
      });
      if (subError) {
        console.error(`Error listing folder ${item.name}:`, subError);
      } else {
        console.log(`Contents of ${item.name}:`, subFiles.map(f => ({ name: f.name, metadata: f.metadata })));
      }
    }
  }
}

main().catch(console.error);
