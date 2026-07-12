-- CreateIndex
CREATE INDEX "Posting_source_idx" ON "Posting"("source");

-- CreateIndex
CREATE INDEX "ShiftChecklistRun_date_idx" ON "ShiftChecklistRun"("date");

-- CreateIndex
CREATE INDEX "Task_slaDeadline_idx" ON "Task"("slaDeadline");

-- CreateIndex
CREATE INDEX "User_login_idx" ON "User"("login");

