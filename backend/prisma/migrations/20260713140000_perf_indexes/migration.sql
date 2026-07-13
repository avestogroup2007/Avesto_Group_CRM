-- CreateIndex
CREATE INDEX "MoneyTx_approval_date_idx" ON "MoneyTx"("approval", "date");

-- CreateIndex
CREATE INDEX "TodoTask_status_dueDate_idx" ON "TodoTask"("status", "dueDate");

