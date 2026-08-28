-- Make SMS credit changes safe when requests arrive at the same time.
-- Run once in Supabase SQL Editor after add-sms-broadcast.sql.

CREATE OR REPLACE FUNCTION public.debit_sms_credits(target_org_id UUID, credit_amount INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF credit_amount < 1 THEN
    RETURN FALSE;
  END IF;

  UPDATE organizations
  SET sms_credits = sms_credits - credit_amount,
      updated_at = now()
  WHERE id = target_org_id
    AND sms_credits >= credit_amount;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_sms_credits(target_org_id UUID, credit_amount INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF credit_amount < 1 THEN
    RETURN FALSE;
  END IF;

  UPDATE organizations
  SET sms_credits = sms_credits + credit_amount,
      updated_at = now()
  WHERE id = target_org_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.debit_sms_credits(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_sms_credits(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debit_sms_credits(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_sms_credits(UUID, INTEGER) TO service_role;
