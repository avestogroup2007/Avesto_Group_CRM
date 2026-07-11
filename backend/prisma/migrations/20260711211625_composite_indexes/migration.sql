-- CreateIndex
CREATE INDEX "AuditLog_userId_event_ip_idx" ON "AuditLog"("userId", "event", "ip");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "MoneyTx_branchId_date_idx" ON "MoneyTx"("branchId", "date");

-- CreateIndex
CREATE INDEX "MoneyTx_approval_direction_branchId_idx" ON "MoneyTx"("approval", "direction", "branchId");

-- CreateIndex
CREATE INDEX "Posting_debit_date_idx" ON "Posting"("debit", "date");

-- CreateIndex
CREATE INDEX "Posting_credit_date_idx" ON "Posting"("credit", "date");

