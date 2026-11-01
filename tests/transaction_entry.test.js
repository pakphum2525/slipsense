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
    state.supabaseClient = { from: () => ({
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
