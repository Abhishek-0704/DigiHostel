-- pgTAP setup: enable the extension for this test session. Idempotent.
create extension if not exists pgtap with schema extensions;

begin;
select plan(1);
select ok(true, 'pgTAP extension available');
select * from finish();
rollback;
