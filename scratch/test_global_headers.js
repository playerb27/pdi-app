const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rdenyvmztjbpcrwnqwqb.supabase.co';
const anonKey = 'sb_publishable_EoAhHcGx5ywJ5U-BC-7LPA_GK04kLuJ';

async function main() {
  try {
    const sb = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      }
    });
    const { data, error } = await sb.from('studies').select('id').limit(1);
    console.log('Query with global headers option succeeded!', data, error);
  } catch (err) {
    console.error('Error with global headers option:', err);
  }
}

main().catch(console.error);
