'use strict';
const assert = require('node:assert/strict');
const { loadApp } = require('./app_harness');

async function put(context, record) {
  const db = await new Promise((resolve, reject) => {
    const request = context.indexedDB.open('slipsense_db');
    request.onsuccess = () => resolve(request.result); request.onerror = reject;
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('transactions', 'readwrite');
    tx.objectStore('transactions').put(record); tx.oncomplete = resolve; tx.onerror = reject;
  });
}

module.exports = async function () {
  await dynamicBuckets();
  for (const variant of ['source', 'built']) {
    const { api, el, emit, html, context } = loadApp(undefined, variant);
    const state = api.getState();
    api.bindUiEvents();
    const details = html.match(/<details\b[^>]*id="txFormOptionalDetails"[^>]*>([\s\S]*?)<\/details>/);
    assert.ok(details, variant);
    assert.doesNotMatch(details[0].split('>')[0], /\sopen\b/);
    assert.match(details[1], /<summary>\+ รายละเอียดเพิ่มเติม<\/summary>/);
    for (const id of ['txFormItemsSummary', 'txFormPurposeAnalysis']) {
      assert.match(details[1], new RegExp('for="' + id + '"'));
      assert.doesNotMatch(details[1].match(new RegExp('<textarea[^>]*id="' + id + '"[^>]*>'))[0], /required/);
    }
    assert.equal(el('txFormMerchant').getAttribute('list'), 'txMerchantHistory');
    assert.equal(el('txMerchantHistory').tagName, 'DATALIST');
    assert.match(html, /ร้านค้า \/ รายการ/);
    for (const id of ['groupTxDate', 'groupTxAmount', 'aiVerificationWarningsBox']) assert.ok(!details[1].includes('id="' + id + '"'));

    state.settings.defaultCurrency = 'USD';
    api.openVerificationModalForManual();
    assert.equal(el('txFormDate').value, api.getBangkokTodayIso());
    assert.equal(el('txFormCurrency').value, 'USD');
    el('txFormOptionalDetails').open = true;
    api.openVerificationModalForManual(); assert.equal(el('txFormOptionalDetails').open, false);
    el('txFormMerchant').value = '  ร้านกาแฟ  '; el('txFormAmount').value = '65.25';
    await emit('btnConfirmSaveTx', 'click');
    assert.equal(el('verificationModal').hidden, true);
    let saved = state.transactions.find(tx => tx.merchant === 'ร้านกาแฟ');
    assert.ok(saved, variant + ': two-field form persisted');
    assert.equal(saved.items_summary, 'ร้านกาแฟ');
    assert.equal(saved.purpose_analysis, 'ไม่ได้ระบุวัตถุประสงค์เพิ่มเติม');
    assert.equal(saved.sync_status, 'local_only');
    const base = { ...saved, merchant: '  ร้าน  เดิม ', category: 'transport', fund_bucket: 'fixed_expense', created_at: '2026-03-01T00:00:00Z' };
    // Array order and the transaction date must not determine the last-used record.
    await put(context, { ...base, id: 'old', created_at: '2026-01-01T00:00:00Z', transaction_date: '2099-01-01', category: 'food_drink' });
    await put(context, { ...base, id: 'latest', transaction_date: '2000-01-01' });
    await put(context, { ...base, id: 'deleted', created_at: '2027-01-01T00:00:00Z', deleted_at: '2027-01-02', category: 'shopping_general' });
    await put(context, { ...base, id: 'pending', created_at: '2028-01-01T00:00:00Z', pending_delete: true });
    await put(context, { ...base, id: 'foreign', user_id: 'someone-else', created_at: '2029-01-01T00:00:00Z', category: 'shopping_general' });
    for (const row of [
      { id: 'tie-a', updated_at: '2026-04-01T00:00:00Z', category: 'transport' },
      { id: 'tie-z', updated_at: '2026-04-01T00:00:00Z', category: 'groceries', fund_bucket: 'home_building' },
      { id: 'tie-old', updated_at: '2026-03-01T00:00:00Z', category: 'food_drink' }
    ]) await put(context, { ...base, merchant: 'tie', ...row });
    for (const row of [
      { id: 'missing-a', updated_at: '2026-01-01T00:00:00Z', category: 'food_drink' },
      { id: 'missing-z', updated_at: '2026-04-01T00:00:00Z', category: 'transport' }
    ]) await put(context, { ...base, merchant: 'missing', created_at: null, ...row });
    const history = await api.readMerchantHistory();
    assert.equal(history.get('tie').category, 'groceries');
    assert.equal(history.get('tie').fund_bucket, 'home_building');
    assert.equal(history.get('missing').category, 'transport');
    await api.automationPreference('learning', { merchants: { 'ร้าน เดิม': { category: 'shopping_general', fund_bucket: 'home_building' } }, chips: [] });
    api.openVerificationModalForManual(); await api.refreshMerchantHistory();
    assert.equal(el('txMerchantHistory').children.filter(o => o.value === 'ร้าน เดิม').length, 1);
    el('txFormMerchant').value = 'ร้าน   เดิม'; await emit('txFormMerchant', 'input');
    assert.equal(el('txFormCategory').value, 'transport'); assert.equal(el('txFormFundBucket').value, 'fixed_expense');
    el('txFormMerchant').value = 'ร้าน เด'; await emit('txFormMerchant', 'change');
    assert.equal(el('txFormCategory').value, 'food_drink'); assert.equal(el('txFormFundBucket').value, 'general_expense');
    el('txFormMerchant').value = 'ร้าน เดิม'; await emit('txFormMerchant', 'change');
    el('txFormCategory').value = 'health_medical'; await emit('txFormCategory', 'change');
    el('txFormFundBucket').value = 'home_building'; await emit('txFormFundBucket', 'input');
    await emit('txFormMerchant', 'input');
    assert.equal(el('txFormCategory').value, 'health_medical'); assert.equal(el('txFormFundBucket').value, 'home_building');

    const ai = { date: null, amount: null, merchant: 'ร้าน เดิม', category: 'education_work', fund_bucket: 'investment_stock',
      items_summary: 'รายละเอียด AI', purpose_analysis: 'วัตถุประสงค์ AI', type: 'expense', source_type: 'receipt', warnings: ['อ่านไม่ชัด'] };
    api.openVerificationModalFromAiResult(ai); await emit('txFormMerchant', 'input');
    assert.equal(el('txFormDate').value, ''); assert.equal(el('txFormAmount').value, '');
    assert.equal(el('txFormCategory').value, 'education_work'); assert.equal(el('txFormFundBucket').value, 'investment_stock');
    assert.equal(el('txFormItemsSummary').value, ai.items_summary); assert.equal(el('txFormPurposeAnalysis').value, ai.purpose_analysis);
    assert.equal(el('aiVerificationWarningsBox').hidden, false);
    await emit('btnConfirmSaveTx', 'click'); assert.equal(el('verificationModal').hidden, false);
    assert.equal(el('txFormValidationErrorsBox').hidden, false);
    el('txFormMerchant').value = 'ใหม่'; await emit('txFormMerchant', 'input');
    assert.equal(el('txFormCategory').value, 'food_drink');
    api.openVerificationModalForEdit({ ...base, note: 'เก็บไว้' });
    await emit('txFormMerchant', 'change');
    assert.equal(el('txFormFundBucket').value, 'fixed_expense'); assert.equal(el('txFormNote').value, 'เก็บไว้');
    assert.equal(el('txFormOptionalDetails').open, false);

    // Pending lookup cannot write after another input, another modal, a user edit, or an account change.
    api.openVerificationModalForManual(); el('txFormMerchant').value = 'ร้าน เดิม';
    const first = emit('txFormMerchant', 'input');
    el('txFormMerchant').value = 'ไม่มี'; const second = emit('txFormMerchant', 'input');
    await Promise.all([first, second]); assert.equal(el('txFormCategory').value, 'food_drink');
    el('txFormMerchant').value = 'ร้าน เดิม'; const reopened = emit('txFormMerchant', 'input');
    api.openVerificationModalFromAiResult(ai); await reopened; assert.equal(el('txFormCategory').value, 'education_work');
    api.openVerificationModalForManual(); el('txFormMerchant').value = 'ร้าน เดิม'; const edited = emit('txFormMerchant', 'input');
    el('txFormCategory').value = 'groceries'; await emit('txFormCategory', 'change'); await edited;
    assert.equal(el('txFormCategory').value, 'groceries');
    api.openVerificationModalForManual(); el('txFormMerchant').value = 'ร้าน เดิม'; const switched = emit('txFormMerchant', 'input');
    state.currentUser = { id: 'new-account' }; await switched; await api.refreshMerchantHistory();
    assert.equal(el('txFormCategory').value, 'food_drink'); assert.equal(el('txMerchantHistory').children.length, 0);
    state.currentUser = null;

    // Cache compatibility, Unicode NFC, invalid values, and text-only option construction.
    await api.automationPreference('learning', { merchants: { 'CAFÉ': 'transport', '<img onerror=alert(1)>': { category: '__proto__', fund_bucket: 'bad' } }, chips: [] });
    api.openVerificationModalForManual(); el('txFormMerchant').value = ' cafe\u0301 '; await emit('txFormMerchant', 'input');
    assert.equal(el('txFormCategory').value, 'transport');
    el('txFormMerchant').value = '<img onerror=alert(1)>'; await emit('txFormMerchant', 'change');
    assert.equal(el('txFormCategory').value, 'food_drink'); assert.equal(el('txFormFundBucket').value, 'general_expense');
    await api.refreshMerchantHistory();
    const option = el('txMerchantHistory').children.find(o => o.value.startsWith('<img'));
    assert.equal(option.textContent, '<img onerror=alert(1)>'); assert.equal(option.children.length, 0);

    const manual = { ...saved, items_summary: ' ระบุเอง ', purpose_analysis: ' เหตุผล ', source_type: 'manual' };
    assert.equal(api.validateTransactionInput(manual).normalized.items_summary, 'ระบุเอง');
    assert.equal(api.validateTransactionInput(manual).normalized.purpose_analysis, 'เหตุผล');
    for (const source_type of ['receipt', 'transfer_slip']) {
      const normalized = api.validateTransactionInput({ ...manual, source_type, items_summary: ' ', purpose_analysis: '' }).normalized;
      assert.equal(normalized.items_summary, ''); assert.equal(normalized.purpose_analysis, '');
    }
    let cloudPayload;
    state.currentUser = { id: 'cloud-owner' }; state.supabaseConnected = true;
    state.supabaseClient = { from: table => table !== 'transactions' ? {
      select: () => ({ eq: async () => ({ data: [], error: null }) }), upsert: async () => ({ error: null })
    } : ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: payload => { cloudPayload = payload; return { select: () => ({ single: async () => ({ data: payload, error: null }) }) }; }
    }) };
    api.openVerificationModalForManual(); el('txFormMerchant').value = 'Cloud'; el('txFormAmount').value = '10';
    await emit('btnConfirmSaveTx', 'click');
    assert.equal(cloudPayload.items_summary, 'Cloud'); assert.equal(cloudPayload.purpose_analysis, 'ไม่ได้ระบุวัตถุประสงค์เพิ่มเติม');
    assert.equal(cloudPayload.user_id, 'cloud-owner');
    context.indexedDB.failWrites = true;
    api.openVerificationModalForManual(); el('txFormMerchant').value = 'Failed'; el('txFormAmount').value = '20';
    await emit('btnConfirmSaveTx', 'click');
    assert.equal(el('verificationModal').hidden, false);
    assert.equal((await api.automationPreference('learning')).merchants.failed, undefined);
  }
};

async function dynamicBuckets() {
  const { createIndexedDB } = require('./idb_harness');
  for (const variant of ['source', 'built']) {
    const idb = createIndexedDB(), app = loadApp(idb, variant), { api, context, el } = app;
    context.navigator.onLine = false;
    let registry = await api.loadFundBuckets();
    assert.equal(registry.buckets.length, 6);
    const input = { name: 'เที่ยว', icon: '✈️', color: '#123abc', is_cumulative: true };
    for (const invalid of [{ name: ' ' }, { icon: '<img>' }, { color: 'red' }, { is_cumulative: 'true' }]) {
      await assert.rejects(api.createFundBucket({ ...input, ...invalid }));
    }
    const key = await api.createFundBucket(input);
    assert(key.length <= 50);
    const renamed = await api.updateFundBucket(key, { name: '<เที่ยว>', icon: '🐱', color: '#abcdef' });
    assert.equal(renamed, key, 'rename retains key');
    registry = await api.loadFundBuckets();
    assert.equal(registry.buckets.find(b => b.bucket_key === key).name, '<เที่ยว>');
    assert(el('txFormFundBucket').children.some(n => n.value === key));
    const row = { transaction_date: '2026-10-01', type: 'income', amount: 100, merchant: 'เติม', category: 'salary_income', source_type: 'manual', fund_bucket: key };
    await api.saveTransaction(row);
    await api.saveTransaction({ ...row, transaction_date: '2026-11-01', amount: 20 });
    let balance = () => api.calculateDashboardMetrics(api.getState().transactions, '2026-11').fundBalances.find(b => b.bucket === key);
    assert.equal(balance().availableBalance, 120);
    await api.updateFundBucket(key, { is_cumulative: false });
    assert.equal(balance().availableBalance, 20);
    const count = api.getState().transactions.length, sum = api.getState().transactions.reduce((n, r) => n + r.amount, 0);
    idb.failWrites = true;
    await assert.rejects(api.deleteFundBucket(key, 'general_expense'));
    assert(api.FUND_BUCKET_LABELS[key], 'failed commit retains UI registry');
    idb.failWrites = false;
    registry = await api.loadFundBuckets();
    assert(registry.buckets.some(b => b.bucket_key === key), 'IDB abort rolls back registry');
    await assert.rejects(api.deleteFundBucket(key, key));
    await assert.rejects(api.deleteFundBucket(key, 'missing'));
    await api.deleteFundBucket(key, 'general_expense');
    assert.equal(api.getState().transactions.length, count);
    assert.equal(api.getState().transactions.reduce((n, r) => n + r.amount, 0), sum);
    assert(api.getState().transactions.every(r => r.fund_bucket === 'general_expense'));
    const reopened = loadApp(idb, variant);
    registry = await reopened.api.loadFundBuckets();
    assert(!registry.buckets.some(b => b.bucket_key === key), 'deleted bucket stays deleted on reopen');
    assert.equal(registry.deletions[0].target_key, 'general_expense');
    const destination = await api.createFundBucket({ ...input, name: 'ปลายทาง' });
    el('txFormFundBucket').value = 'fixed_expense'; el('filterFundSelect').value = 'fixed_expense';
    await api.deleteFundBucket('fixed_expense', destination);
    assert.equal(el('txFormFundBucket').value, destination);
    assert.equal(el('filterFundSelect').value, destination);
    await api.saveTransaction({ ...row, fund_bucket: 'fixed_expense' });
    assert(api.getState().transactions.some(r => r.fund_bucket === destination), 'legacy preset resolves through deletion intent');
    await api.validateAndImportBackup(JSON.stringify({ fund_buckets: [{ ...input, bucket_key: 'imported_trip', name: 'จากสำรอง', sort_order: 20 }], transactions: [{ ...row, id: '12345678-1234-4234-8234-123456789abc', fund_bucket: 'imported_trip' }] }));
    assert.equal(api.FUND_BUCKET_LABELS.imported_trip, '✈️ จากสำรอง');
    assert(api.getState().transactions.some(r => r.id === '12345678-1234-4234-8234-123456789abc' && r.fund_bucket === 'imported_trip'));
    const state = api.getState(); state.currentUser = { id: 'alice' };
    await api.loadFundBuckets();
    assert(!api.FUND_BUCKET_LABELS[key], 'account registry isolated');
    const ownKey = await api.createFundBucket(input);
    state.currentUser = { id: 'bob' }; await api.loadFundBuckets();
    assert(!api.FUND_BUCKET_LABELS[ownKey]);
    state.currentUser = { id: 'alice' }; await api.loadFundBuckets();
    assert(api.FUND_BUCKET_LABELS[ownKey]);
    await api.saveTransaction({ ...row, fund_bucket: ownKey });
    assert(api.getState().transactions.some(r => r.user_id === 'alice' && r.fund_bucket === ownKey && r.sync_status === 'pending_sync'), 'offline save retains signed-in owner');
    await put(context, { ...row, id: 'bob-row', user_id: 'bob', fund_bucket: ownKey });
    await api.deleteFundBucket(ownKey, 'general_expense');
    const db = await new Promise(resolve => { const r = idb.open('slipsense_db', 3); r.onsuccess = () => resolve(r.result); });
    const all = await new Promise(resolve => { const r = db.transaction('transactions').objectStore('transactions').getAll(); r.onsuccess = () => resolve(r.result); });
    assert.equal(all.find(r => r.id === 'bob-row').fund_bucket, ownKey, 'delete never moves another owner');
    // A schema failure keeps durable work; a successful retry upserts buckets before RPC.
    context.navigator.onLine = true;
    const cloudBuckets = new Map(), cloudDeletions = [], calls = [], cloudRows = new Map();
    cloudBuckets.set('general_expense', { ...input, name: 'ชื่อจาก Cloud', bucket_key: 'general_expense', user_id: 'alice', sort_order: 4, updated_at: '2026-11-01T00:00:00Z' });
    cloudRows.set('server-only', { ...row, id: 'server-only', user_id: 'alice', amount: 150, fund_bucket: ownKey });
    let fail = true, loseResponse = true;
    state.supabaseClient = {
      from(table) { return {
        select() { return { eq: (_, owner) => table === 'transactions' ? {
          maybeSingle: async () => ({ data: cloudRows.get(owner) || null, error: null }),
          order: async () => { const data = [...cloudRows.values()].filter(r => r.user_id === owner); return { data, count: data.length, error: null }; }
        } : Promise.resolve({ data: table === 'fund_buckets' ? [...cloudBuckets.values()].filter(r => r.user_id === owner) : cloudDeletions.filter(r => r.user_id === owner), error: fail ? { message: 'schema missing' } : null }) }; },
        upsert(row) {
          if (table === 'transactions') return { select: () => ({ single: async () => {
            calls.push('tx:' + row.fund_bucket); assert(cloudBuckets.has(row.fund_bucket), 'registry sync precedes transaction');
            cloudRows.set(row.id, { ...row }); return { data: row, error: null };
          } }) };
          calls.push('upsert:' + row.bucket_key); cloudBuckets.set(row.bucket_key, { ...row, updated_at: '2026-11-01T00:00:00Z' }); return { error: null };
        }
      }; },
      async rpc(name, args) {
        calls.push('rpc:' + args.p_source_key);
        assert.equal(name, 'delete_fund_bucket');
        assert(cloudBuckets.has(args.p_target_key), 'destination exists before RPC');
        cloudBuckets.delete(args.p_source_key);
        for (const r of cloudRows.values()) if (r.fund_bucket === args.p_source_key) r.fund_bucket = args.p_target_key;
        cloudDeletions.push({ id: args.p_operation_id, source_key: args.p_source_key, target_key: args.p_target_key, user_id: 'alice' });
        if (loseResponse) { loseResponse = false; throw new Error('response lost'); }
        return { error: null };
      }
    };
    assert.equal(await api.syncFundBuckets(), false);
    registry = await api.loadFundBuckets();
    assert(registry.deletions.some(d => d.source_key === ownKey && d.sync_status === 'sync_failed'));
    fail = false;
    assert.equal(await api.syncFundBuckets(), false, 'lost reply preserves retry');
    assert.equal(await api.syncFundBuckets(), true, 'retry recognizes server tombstone');
    assert.equal(calls.filter(c => c === 'rpc:' + ownKey).length, 1, 'no repeated move after success');
    registry = await api.loadFundBuckets();
    assert(!registry.buckets.some(b => b.bucket_key === ownKey));
    assert(registry.deletions.some(d => d.source_key === ownKey && d.sync_status === 'synced'));
    assert.equal(api.FUND_BUCKET_LABELS.general_expense, '✈️ ชื่อจาก Cloud', 'first login preserves existing server metadata');
    assert.equal(cloudRows.get('server-only').fund_bucket, 'general_expense', 'RPC includes unloaded rows in simulated server');
    context.navigator.onLine = false;
    const nextKey = await api.createFundBucket({ ...input, name: 'กาแฟ', icon: '☕' });
    await api.saveTransaction({ ...row, fund_bucket: nextKey });
    context.navigator.onLine = true;
    const result = await api.syncPendingTransactions();
    assert.equal(result.failedCount, 0);
    assert(result.syncedCount >= 1);
    assert(calls.indexOf('upsert:' + nextKey) < calls.indexOf('tx:' + nextKey));
    assert(api.getState().transactions.some(r => r.id === 'server-only'));
    // The offline destination can be deleted by another device before our queued move runs.
    const chainedSource = await api.createFundBucket({ ...input, name: 'ต้นทาง' });
    const chainedTarget = await api.createFundBucket({ ...input, name: 'ปลายทางเดิม' });
    assert.equal(await api.syncFundBuckets(), true);
    context.navigator.onLine = false;
    await api.saveTransaction({ ...row, fund_bucket: chainedSource });
    await api.deleteFundBucket(chainedSource, chainedTarget);
    cloudBuckets.delete(chainedTarget);
    cloudDeletions.push({ id: 'other-device-move', source_key: chainedTarget, target_key: 'general_expense', user_id: 'alice' });
    const originalRpc = state.supabaseClient.rpc;
    state.supabaseClient.rpc = async (name, args) => {
      if (args.p_source_key === chainedSource) assert.equal(args.p_target_key, 'general_expense', 'follow remote destination tombstone');
      return originalRpc(name, args);
    };
    context.navigator.onLine = true;
    assert.equal(await api.syncFundBuckets(), true, 'queued deletion survives a remotely deleted destination');
    assert.equal(await api.syncFundBuckets(), true, 'replaying the deletion is safe');
    assert.equal(calls.filter(c => c === 'rpc:' + chainedSource).length, 1);
    registry = await api.loadFundBuckets();
    assert(!registry.buckets.some(b => [chainedSource, chainedTarget].includes(b.bucket_key)));
    assert.equal((await api.syncPendingTransactions()).failedCount, 0);
    assert(api.getState().transactions.every(r => ![chainedSource, chainedTarget].includes(r.fund_bucket)));
    state.supabaseClient.auth = { getSession: async () => ({ data: { session: { user: { id: 'bob' } } } }) };
    assert.equal(await api.syncFundBuckets(), false, 'session mismatch fails before network writes');
    // Guard the last bucket after deleting defaults; never seed deleted defaults again.
    state.currentUser = null; await api.loadFundBuckets();
    for (const b of (await api.loadFundBuckets()).buckets) if (b.bucket_key !== 'general_expense') await api.deleteFundBucket(b.bucket_key, 'general_expense');
    await assert.rejects(api.deleteFundBucket('general_expense', 'missing'));
    assert.equal((await loadApp(idb, variant).api.loadFundBuckets()).buckets.length, 1);
    api.bindBucketEvents(); api.openBucketModal();
    await el('bucketModal').emit('keydown', { key: 'Escape', preventDefault() {} });
    assert.equal(el('bucketModal').hidden, true);
  }
}
