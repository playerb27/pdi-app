const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rdenyvmztjbpcrwnqwqb.supabase.co';
const anonKey = 'sb_publishable_EoAhHcGx5ywJ5U-BC-7LPA_GK04kLuJ';

async function main() {
  const sb = createClient(supabaseUrl, anonKey);
  try {
    const query = sb
      .from('studies')
      .select('id')
      .limit(1)
      .headers({ 'Cache-Control': 'no-cache' });
    
    const { data, error } = await query;
    console.log('Query with .headers() succeeded!', data, error);
  } catch (err) {
    console.error('Error calling .headers():', err);
  }
}

main().catch(console.error);
