-- Учётки из iiko входят по живому паролю iiko (SSO) — принудительная смена
-- пароля при первом входе для них не имеет смысла: снимаем флаг у существующих.
UPDATE "User" SET "mustChangePassword" = false
WHERE "source" = 'iiko' AND "login" IS NOT NULL;
