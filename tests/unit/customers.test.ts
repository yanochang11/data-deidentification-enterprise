import { describe, expect, it } from 'vitest';
import { detect } from '../../src/core/detector';
import { BUILTIN_PATTERNS } from '../../src/core/patterns';
import { CodeBook } from '../../src/core/codes';
import { applyRedactions } from '../../src/core/redactor';
import { restore } from '../../src/core/restorer';
import { findCustomerByAlias, CUSTOMER_BY_CODE } from '../../src/core/customers-data';

describe('明昌企業客戶辨識與自動客戶編碼 (157 家對照表)', () => {
  it('loads the customer registry properly with 157 customers', () => {
    expect(CUSTOMER_BY_CODE.size).toBe(157);
    expect(CUSTOMER_BY_CODE.get('CA0001')?.fullName).toBe('ADEL ABUBAKER BARAKAT CO.');
    expect(CUSTOMER_BY_CODE.get('CA0003')?.fullName).toBe('Grainger International Inc.');
    expect(CUSTOMER_BY_CODE.get('CA0058')?.fullName).toBe('HOME DEPOT');
  });

  it('accurately resolves full names and aliases', () => {
    expect(findCustomerByAlias('Grainger International Inc.')?.code).toBe('CA0003');
    expect(findCustomerByAlias('Grainger')?.code).toBe('CA0003');
    expect(findCustomerByAlias('grainger')?.code).toBe('CA0003');
    expect(findCustomerByAlias('Home Depot')?.code).toBe('CA0058');
    expect(findCustomerByAlias('HOME DEPOT')?.code).toBe('CA0058');
    expect(findCustomerByAlias('Apex Tool Group, LLC')?.code).toBe('CA0005');
    expect(findCustomerByAlias('Apex')?.code).toBe('CA0005');
    expect(findCustomerByAlias('Bunnings')?.code).toBe('CA0008');
    expect(findCustomerByAlias('Wera')?.code).toBe('CA1386');
    expect(findCustomerByAlias('FACOM')?.code).toBe('CA0041');
    expect(findCustomerByAlias('拓信')?.code).toBe('CA0059');
  });

  it('detects customers in text and automatically assigns their official customer codes', () => {
    const text = '本合約買方為 Grainger International Inc.，由業務四部郭香君負責。後續交貨與 Grainger 直接對接。';
    const book = new CodeBook();
    const items = detect(text, BUILTIN_PATTERNS, book);

    const customerItems = items.filter((it) => it.category === '客戶');
    expect(customerItems.length).toBe(2);

    // Both full name and abbreviation receive the same official customer code CA0003
    expect(customerItems[0].original).toBe('Grainger International Inc.');
    expect(customerItems[0].code).toBe('CA0003');

    expect(customerItems[1].original).toBe('Grainger');
    expect(customerItems[1].code).toBe('CA0003');
  });

  it('correctly handles various international customer names in mixed text', () => {
    const text = '客戶包含 Home Depot、Harbor Freight、Bunnings、Wera、FACOM 以及中東客戶 ADEL ABUBAKER BARAKAT CO.。';
    const items = detect(text, BUILTIN_PATTERNS);
    const codes = items.filter((it) => it.category === '客戶').map((it) => ({ name: it.original, code: it.code }));

    expect(codes).toContainEqual({ name: 'Home Depot', code: 'CA0058' });
    expect(codes).toContainEqual({ name: 'Harbor Freight', code: 'CA0064' });
    expect(codes).toContainEqual({ name: 'Bunnings', code: 'CA0008' });
    expect(codes).toContainEqual({ name: 'Wera', code: 'CA1386' });
    expect(codes).toContainEqual({ name: 'FACOM', code: 'CA0041' });
    expect(codes).toContainEqual({ name: 'ADEL ABUBAKER BARAKAT CO.', code: 'CA0001' });
  });

  it('redacts to [客戶:CA0003] under code mode and restores accurately', () => {
    const text = '採購商：Grainger International Inc.，確認無誤。';
    const items = detect(text, BUILTIN_PATTERNS);

    const result = applyRedactions(text, items, 'code');
    expect(result.redactedText).toContain('[客戶:CA0003]');
    expect(result.mapping).toContainEqual({
      code: 'CA0003',
      category: '客戶',
      original: 'Grainger International Inc.',
    });

    // Test restoration
    const restored = restore(result.redactedText, result.mapping);
    expect(restored.restoredText).toBe(text);
    expect(restored.missingCodes).toEqual([]);
    expect(restored.restoredCount).toBe(1);
  });

  it('redacts to [客戶] under label mode without leaking customer code', () => {
    const text = '採購商：Grainger International Inc.，確認無誤。';
    const items = detect(text, BUILTIN_PATTERNS);

    const result = applyRedactions(text, items, 'label');
    expect(result.redactedText).toBe('採購商：[客戶]，確認無誤。');
  });

  it('automatically detects unlisted customer names via context labels and masks them cleanly', () => {
    const text = '客戶名稱：宏盛精密工業股份有限公司\n買受人：David Miller\nCustomer Name: Nordic Hardware Group AB';
    const items = detect(text, BUILTIN_PATTERNS);
    const customerItems = items.filter((it) => it.category === '客戶').map((it) => it.original);

    expect(customerItems).toEqual([
      '宏盛精密工業股份有限公司',
      'David Miller',
      'Nordic Hardware Group AB',
    ]);

    const labelRedacted = applyRedactions(text, items, 'label');
    expect(labelRedacted.redactedText).toBe('客戶名稱：[客戶]\n買受人：[客戶]\nCustomer Name: [客戶]');
  });
});
