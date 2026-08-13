DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'konooz_app') THEN
    GRANT DELETE ON TABLE "sales" TO "konooz_app";
  END IF;
END
$$;
