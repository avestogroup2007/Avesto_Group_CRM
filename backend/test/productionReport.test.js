// Юнит-тест разбора выгрузки актов приготовления iiko (без сети):
// терпимость к обёрткам, статусы, позиции с productId/amount.
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseProductionDocsXml,
  buildProductionXml,
} from "../src/services/iikoServer.js";

const XML = `<?xml version="1.0"?>
<productionDocumentDtoes>
  <document>
    <documentNumber>PRO-1</documentNumber>
    <dateIncoming>2026-07-10T12:00:00</dateIncoming>
    <status>PROCESSED</status>
    <items>
      <item><productId>aaa</productId><storeId>s1</storeId><amount>2.5</amount></item>
      <item><productId>bbb</productId><storeId>s1</storeId><amount>10</amount></item>
    </items>
  </document>
  <document>
    <documentNumber>PRO-2</documentNumber>
    <status>DELETED</status>
    <items>
      <item><productId>aaa</productId><amount>1</amount></item>
    </items>
  </document>
</productionDocumentDtoes>`;

test("разбор актов: документы, статусы и позиции", () => {
  const docs = parseProductionDocsXml(XML);
  assert.equal(docs.length, 2);
  assert.equal(docs[0].documentNumber, "PRO-1");
  assert.equal(docs[0].status, "PROCESSED");
  assert.equal(docs[0].items.length, 2);
  assert.deepEqual(docs[0].items[0], { productId: "aaa", amount: 2.5 });
  assert.equal(docs[1].status, "DELETED");
});

test("разбор актов: пустой/чужой ответ — пустой список, не исключение", () => {
  assert.deepEqual(parseProductionDocsXml(""), []);
  assert.deepEqual(parseProductionDocsXml("<html>login page</html>"), []);
});

test("сборка акта: склад задан и на документе, и в позициях", () => {
  const xml = buildProductionXml({
    date: "2026-07-14",
    storeId: "store-guid-1",
    items: [{ productId: "p1", amount: 3 }],
    number: "A-1",
    comment: "тест",
  });
  // Склад документа обязателен — без него iiko отвергает акт (store must not be null).
  assert.match(
    xml,
    /<document>[\s\S]*<storeId>store-guid-1<\/storeId>[\s\S]*<items>/
  );
  assert.match(
    xml,
    /<item><productId>p1<\/productId><storeId>store-guid-1<\/storeId><amount>3<\/amount><\/item>/
  );
  assert.match(xml, /<documentNumber>A-1<\/documentNumber>/);
});
