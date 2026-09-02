-- RLS scenario: guardian access follows the guardian relationship
-- (relationship_type = 'guardian' authorizes identically to father/mother —
-- the RLS policy joins on parent_student_relationships regardless of type,
-- per docs/database-schema-design.md's design choice to unify parent/guardian
-- into one `parents` table distinguished only by relationship_type).
begin;
select plan(3);

set local role authenticated;

-- The guardian (aaaaaaaa-...) is linked ONLY to student2, as 'guardian'.
set local request.jwt.claims to '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

select is(
  (select count(*) from students where id = 'c0000000-0000-0000-0000-000000000002')::int, 1,
  'guardian: can see their linked student (student2)'
);
select is(
  (select count(*) from students where id = 'c0000000-0000-0000-0000-000000000001')::int, 0,
  'guardian: cannot see an unrelated student (student1)'
);
select is(
  (select relationship_type from parent_student_relationships
    where parent_id = 'd0000000-0000-0000-0000-000000000004'
      and student_id = 'c0000000-0000-0000-0000-000000000002')::text,
  'guardian',
  'guardian: relationship_type is correctly recorded as guardian, not father/mother'
);

select * from finish();
rollback;
