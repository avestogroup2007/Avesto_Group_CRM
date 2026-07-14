// Тест разбора XML приходных накладных iiko (чистая функция).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIncomingInvoicesXml } from "../src/services/iikoServer.js";

test("parseIncomingInvoicesXml разбирает документы и позиции", () => {
  const xml = `<incomingInvoiceDtoes>
    <document>
      <id>doc1</id>
      <documentNumber>N-1</documentNumber>
      <dateIncoming>2024-01-15T12:00:00</dateIncoming>
      <supplier>sup1</supplier>
      <items>
        <item><productId>p1</productId><amount>10</amount><price>1000</price><sum>10000</sum><store>s1</store></item>
        <item><productId>p2</productId><amount>5</amount><price>2000</price><sum>10000</sum></item>
      </items>
    </document>
  </incomingInvoiceDtoes>`;
  const docs = parseIncomingInvoicesXml(xml);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].iikoDocId, "doc1");
  assert.equal(docs[0].docNumber, "N-1");
  assert.equal(docs[0].items.length, 2);
  assert.equal(docs[0].items[0].productId, "p1");
  assert.equal(docs[0].items[0].price, 1000);
  assert.equal(docs[0].items[0].amount, 10);
  assert.equal(docs[0].items[1].storeId, "");
});

test("parseIncomingInvoicesXml на пустом входе — пусто", () => {
  assert.deepEqual(parseIncomingInvoicesXml(""), []);
  assert.deepEqual(parseIncomingInvoicesXml("<x/>"), []);
});
