const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rdenyvmztjbpcrwnqwqb.supabase.co';
const anonKey = 'sb_publishable_EoAhHcGx5ywJ5U-BC-7LPA_GK04kLuJ';

async function main() {
  const sb = createClient(supabaseUrl, anonKey);
  const targetId = 'dd16cc3c-d511-44ae-89dc-87323270100f';

  console.log('Fetching target biomarker...');
  const { data: bm, error: fErr } = await sb.from('biomarkers').select('*').eq('id', targetId).single();
  if (fErr) {
    console.error('Fetch error:', fErr);
    return;
  }
  console.log('Biomarker before update:', bm);

  console.log('Updating target biomarker value to "200" with is_edited: true...');
  const { data: updated, error: uErr } = await sb
    .from('biomarkers')
    .update({
      value: '200',
      flag: 'Normal',
      is_edited: true,
      original_value: '200000|2026-05-20T20:00:00.000Z'
    })
    .eq('id', targetId)
    .select();

  if (uErr) {
    console.error('Update error:', uErr);
  } else {
    console.log('Update success! Result:', updated);
  }
}

main().catch(console.error);
