-- =====================================================
-- SwiftCheckIn — DEMO SEED  (Grace Chapel)
-- =====================================================
-- Paste this whole file into the Supabase SQL Editor and Run.
-- It is idempotent: re-running wipes and rebuilds the demo org's data,
-- so you always get the same clean demo state.
--
-- Login after seeding:  silasobeng98@gmail.com  /  123456789
-- Kiosk unlock code:     GRACE24
-- =====================================================

DO $$
DECLARE
  v_org   uuid;
  v_hash  text := '$2a$10$Fz0EjGo5Ks0F31De6JvDGuAIjdnKH9iFg4UsIjGqJgJPy/gyYXiEu'; -- bcrypt('123456789')
  v_today date := CURRENT_DATE;
  v_svc_today uuid;
  v_sid   uuid;
  v_date  date;
  wk      int;
  themes  text[]     := ARRAY['The Power of Grace','Walking in Faith','Living with Purpose','A Heart of Worship','Hope that Anchors','Love in Action','Rooted and Grounded','Seasons of Change'];
  scripts text[]     := ARRAY['Ephesians 2:8','Hebrews 11:1','Jeremiah 29:11','John 4:24','Hebrews 6:19','1 John 4:7','Colossians 2:7','Ecclesiastes 3:1'];
BEGIN
  -- 1. Organisation (create, or reuse an existing account on this email) ----
  SELECT id INTO v_org FROM organizations WHERE admin_email = 'silasobeng98@gmail.com';
  IF v_org IS NULL THEN
    INSERT INTO organizations
      (name, slug, tagline, host_names, address, phone, email, brand_color,
       kiosk_welcome_heading, kiosk_welcome_subtext,
       admin_name, admin_email, admin_password_hash,
       subscription_status, subscription_plan, subscription_start_date, subscription_end_date)
    VALUES
      ('Grace Chapel','grace-chapel','A place of worship and community','Pastor Silas & Lady Ama',
       '12 Ring Road, East Legon, Accra','024 000 0000','hello@gracechapel.org','#16243A',
       'Welcome to Grace Chapel','We''re so glad you''re here',
       'Pastor Silas','silasobeng98@gmail.com', v_hash,
       'active','annual', CURRENT_DATE, CURRENT_DATE + INTERVAL '365 days')
    RETURNING id INTO v_org;
  ELSE
    UPDATE organizations SET
      name='Grace Chapel', slug='grace-chapel', admin_name='Pastor Silas',
      admin_password_hash=v_hash,
      subscription_status='active', subscription_plan='annual',
      subscription_end_date=CURRENT_DATE + INTERVAL '365 days',
      brand_color='#16243A', tagline='A place of worship and community',
      host_names='Pastor Silas & Lady Ama', address='12 Ring Road, East Legon, Accra',
      phone='024 000 0000', email='hello@gracechapel.org',
      kiosk_welcome_heading='Welcome to Grace Chapel', kiosk_welcome_subtext='We''re so glad you''re here'
    WHERE id=v_org;
  END IF;

  -- 2. Clean prior demo data for a known state --------------------------------
  DELETE FROM checkins        WHERE org_id=v_org;
  DELETE FROM email_logs      WHERE org_id=v_org;
  BEGIN DELETE FROM giving    WHERE org_id=v_org; EXCEPTION WHEN undefined_table THEN NULL; END;
  DELETE FROM services        WHERE org_id=v_org;
  DELETE FROM people          WHERE org_id=v_org;
  DELETE FROM email_templates WHERE org_id=v_org;

  -- 3. Email templates --------------------------------------------------------
  INSERT INTO email_templates (org_id, template_type, subject, body) VALUES
   (v_org,'welcome','Welcome to {ORG_NAME}!',  E'Dear {NAME},\n\nWe are so glad you joined us today!\n\n{SERVICE_INFO}\n\nWith love,\nThe {ORG_NAME} Family'),
   (v_org,'birthday','Happy Birthday from {ORG_NAME}!', E'Dear {NAME},\n\nWishing you a blessed and joyful birthday! May this new year of your life be filled with God''s grace and favour.\n\nWith love,\nThe {ORG_NAME} Family'),
   (v_org,'missed','We Miss You!', E'Dear {NAME},\n\nWe noticed you''ve missed the last couple of gatherings, and we hope everything is well with you.\n\nWe''d love to see you again soon.\n\nWith love,\nThe {ORG_NAME} Family');

  -- 4. People (leaders, members, visitors) -----------------------------------
  --    Two members are deliberately missing an email / birthday so the
  --    dashboard "Things to know" nudges show something to fix.
  --    Phones 0201110001 / 0201110002 are the two brand-new visitors today.
  INSERT INTO people (org_id, full_name, phone, gender, email, date_of_birth, occupation, company, location, how_found_us, role) VALUES
   (v_org,'Pastor Silas Obeng','0244000001','male','silasobeng98@gmail.com','1980-04-12','Pastor','Grace Chapel','East Legon','Invited by member','leader'),
   (v_org,'Lady Ama Obeng','0244000002','female','ama.obeng@example.com','1983-08-05','Teacher','Ghana Education Service','East Legon','Invited by member','leader'),
   (v_org,'Elder Kofi Mensah','0244000003','male','kofi.mensah@example.com','1975-01-22','Accountant','Ecobank','Adenta','Friend or family','leader'),
   (v_org,'Abena Sarpong','0244000004','female','abena.sarpong@example.com','1992-03-18','Nurse','Korle Bu','Madina','Invited by member','member'),
   (v_org,'Kwame Osei','0244000005','male','kwame.osei@example.com','1988-11-09','Engineer','MTN Ghana','Tema','Social media','member'),
   (v_org,'Esi Boateng','0244000006','female','esi.boateng@example.com','1995-06-27','Trader','Makola Market','Dansoman','Walked past / neighbourhood','member'),
   (v_org,'Joseph Asante','0244000007','male','joseph.asante@example.com','1990-02-14','Banker','GCB Bank','Spintex','Invited by member','member'),
   (v_org,'Benedicta Danso','0244000008','female','benedicta.danso@example.com','1998-09-30','Student','University of Ghana','Legon','Event or programme','member'),
   (v_org,'Akua Mensah','0244000009','female','akua.mensah@example.com','1986-12-03','Seamstress','Self-employed','Achimota','Friend or family','member'),
   (v_org,'Emmanuel Kwarteng','0244000010','male','emmanuel.k@example.com','1993-07-21','Pharmacist','Ernest Chemists','Adenta','Online search','member'),
   (v_org,'Grace Owusu','0244000011','female','grace.owusu@example.com','1991-05-16','Accountant','PwC Ghana','East Legon','Invited by member','member'),
   (v_org,'Daniel Appiah','0244000012','male',NULL,'1984-10-08','Driver','Trotro Union','Kasoa','Walked past / neighbourhood','member'),
   (v_org,'Efua Nyarko','0244000013','female','efua.nyarko@example.com',NULL,'Nurse','37 Military Hospital','Tema','Social media','member'),
   (v_org,'Yaw Darko','0244000014','male','yaw.darko@example.com','1979-08-19','Businessman','Darko Ventures','Spintex','Radio or TV','member'),
   (v_org,'Comfort Adjei','0244000015','female','comfort.adjei@example.com','1996-01-27','Hairdresser','Self-employed','Madina','Invited by member','member'),
   (v_org,'Michael Ofori','0244000016','male',NULL,'1989-04-02','Teacher','St. Johns School','Achimota','Flyer or poster','member'),
   (v_org,'Gifty Amoah','0201110010','female','gifty.amoah@example.com','1994-11-11','Marketer','Unilever','Dansoman','Social media','visitor'),
   (v_org,'Samuel Tetteh','0201110011','male',NULL,'1987-06-06','Electrician','Self-employed','Tema','Walked past / neighbourhood','visitor'),
   (v_org,'Linda Asare','0201110012','female','linda.asare@example.com','1999-02-28','Student','GIMPA','Legon','Invited by member','visitor'),
   (v_org,'Priscilla Agyeman','0201110001','female','priscilla.a@example.com','1997-09-15','Teacher','Private','Adenta','Invited by member','visitor'),
   (v_org,'Richmond Boadi','0201110002','male','richmond.boadi@example.com','1992-12-19','Accountant','KPMG','East Legon','Online search','visitor');

  -- 5. Today's service (active) ----------------------------------------------
  INSERT INTO services (org_id, service_date, service_time, title, theme, scripture, is_active)
  VALUES (v_org, v_today, '9:00 AM', 'Sunday Service', themes[1], scripts[1], true)
  RETURNING id INTO v_svc_today;

  -- 6. Seven past Sundays + their check-ins (history for analytics) -----------
  FOR wk IN 1..7 LOOP
    v_date := v_today - (wk*7);
    INSERT INTO services (org_id, service_date, service_time, title, theme, scripture, is_active)
    VALUES (v_org, v_date, '9:00 AM', 'Sunday Service', themes[wk+1], scripts[wk+1], false)
    RETURNING id INTO v_sid;

    INSERT INTO checkins (org_id, person_id, service_id, checked_in_at, is_first_time, synced)
    SELECT v_org, pe.id, v_sid,
           (v_date::timestamp + interval '9 hours' + (floor(random()*80)||' minutes')::interval),
           false, true
    FROM people pe
    WHERE pe.org_id = v_org
      AND ( (pe.role IN ('member','leader') AND random() < 0.80)
            OR (pe.role = 'visitor' AND pe.phone NOT IN ('0201110001','0201110002') AND random() < 0.30) )
    ON CONFLICT (org_id, person_id, service_id) DO NOTHING;
  END LOOP;

  -- 7. Kiosk settings — open, with a memorable code --------------------------
  INSERT INTO app_settings (org_id, kiosk_open, active_service_id, kiosk_access_code, updated_at)
  VALUES (v_org, true, v_svc_today, 'GRACE24', now())
  ON CONFLICT (org_id) DO UPDATE
    SET kiosk_open=EXCLUDED.kiosk_open, active_service_id=EXCLUDED.active_service_id,
        kiosk_access_code=EXCLUDED.kiosk_access_code, updated_at=now();

  -- 8. Today's check-ins — ~2/3 of regulars (so some are absent for the report),
  --    two returning visitors, and the two brand-new visitors.
  INSERT INTO checkins (org_id, person_id, service_id, checked_in_at, is_first_time, synced)
  SELECT v_org, pe.id, v_svc_today,
         (v_today::timestamp + interval '9 hours' + (floor(random()*70)||' minutes')::interval),
         false, true
  FROM people pe
  WHERE pe.org_id = v_org
    AND ( (pe.role IN ('member','leader') AND random() < 0.68)
          OR (pe.role='visitor' AND pe.phone IN ('0201110010','0201110012') AND random() < 0.6) )
  ON CONFLICT (org_id, person_id, service_id) DO NOTHING;

  INSERT INTO checkins (org_id, person_id, service_id, checked_in_at, is_first_time, synced)
  SELECT v_org, pe.id, v_svc_today,
         (v_today::timestamp + interval '9 hours' + (floor(random()*70)||' minutes')::interval),
         false, true
  FROM people pe
  WHERE pe.org_id = v_org AND pe.phone IN ('0201110001','0201110002')
  ON CONFLICT (org_id, person_id, service_id) DO NOTHING;

  -- 9. Mark each person's earliest check-in as their first time --------------
  UPDATE checkins c SET is_first_time = true
  FROM (SELECT person_id, MIN(checked_in_at) AS first_at
        FROM checkins WHERE org_id=v_org GROUP BY person_id) f
  WHERE c.org_id=v_org AND c.person_id=f.person_id AND c.checked_in_at=f.first_at;

  -- 10. Giving — spread over the last few weeks, mixed types & methods --------
  --     Wrapped so the seed still succeeds if the giving table isn't present.
  BEGIN
    -- Giving must land ON the service dates. The service report buckets giving
    -- by calendar day, so scattering it across random weekdays left the report's
    -- giving section reading "Total 0" — which is precisely what showed up in
    -- testing. One pass per Sunday, today included.
    DELETE FROM giving WHERE org_id = v_org;

    INSERT INTO giving (org_id, person_id, giver_name, giver_email, amount, currency,
                        giving_type, payment_method, status, created_at)
    SELECT v_org, pe.id, pe.full_name, pe.email,
           (ARRAY[50,80,100,150,200,250,300,500])[1+floor(random()*8)]::numeric,
           'GHS',
           (ARRAY['tithe','offering','seed','pledge'])[1+floor(random()*4)],
           (ARRAY['cash','mobile_money','bank_transfer'])[1+floor(random()*3)],
           CASE WHEN random() < 0.5 THEN 'sent' ELSE 'recorded' END,
           ((v_today - (gw.week_offset * 7))::timestamp
             + interval '10 hours' + (floor(random()*90)||' minutes')::interval)
    FROM generate_series(0, 7) AS gw(week_offset)
    CROSS JOIN people pe
    WHERE pe.org_id=v_org AND pe.role IN ('member','leader') AND random() < 0.55;
  EXCEPTION WHEN OTHERS THEN
    -- Any mismatch in the giving table (absent, or different columns) just
    -- skips this section rather than failing the whole seed.
    RAISE NOTICE 'giving not seeded (%) — that tab will simply show empty', SQLERRM;
  END;

  RAISE NOTICE 'Grace Chapel demo seeded. Login: silasobeng98@gmail.com / 123456789  ·  Kiosk code: GRACE24';
END $$;
