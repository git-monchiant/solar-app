import assert from "node:assert/strict";
import {
  grantsRole,
  hasAnyGrantedRole,
  parseActiveRolesHeader,
  resolveEffectiveRoles,
} from "../../src/lib/role-permissions.ts";

assert.equal(grantsRole("solar_sup", "solar"), true);
assert.equal(grantsRole("sales_sup", "sales"), true);
assert.equal(grantsRole("solar_sup", "solar_sup"), true);
assert.equal(grantsRole("sales_sup", "sales_sup"), true);

assert.equal(grantsRole("solar", "solar_sup"), false);
assert.equal(grantsRole("sales", "sales_sup"), false);
assert.equal(grantsRole("solar_sup", "sales"), false);
assert.equal(grantsRole("sales_sup", "solar"), false);

assert.equal(hasAnyGrantedRole(["solar_sup"], ["solar"]), true);
assert.equal(hasAnyGrantedRole(["sales_sup"], ["sales"]), true);
assert.equal(hasAnyGrantedRole(["solar"], ["solar_sup", "sales_sup"]), false);
assert.equal(hasAnyGrantedRole(["sales"], ["solar_sup", "sales_sup"]), false);
assert.equal(hasAnyGrantedRole([], ["solar"]), false);

assert.deepEqual(resolveEffectiveRoles(["admin", "sales"], ["sales"]), ["sales"]);
assert.deepEqual(resolveEffectiveRoles(["admin", "sales"], ["admin", "sales", "solar_sup"]), ["admin", "sales", "solar_sup"]);
assert.deepEqual(resolveEffectiveRoles(["sales"], ["sales_sup"]), []);
assert.deepEqual(resolveEffectiveRoles(["sales", "sales_sup"], ["sales_sup"]), ["sales_sup"]);
assert.deepEqual(resolveEffectiveRoles(["sales_sup"], []), []);
assert.deepEqual(parseActiveRolesHeader('["sales","sales"]'), ["sales"]);
assert.deepEqual(parseActiveRolesHeader('["not-a-role"]'), []);
assert.deepEqual(parseActiveRolesHeader("invalid"), []);

// ★ role ทีม B2B (แผน 20261005-01) — ไม่สืบสิทธิ์ข้ามทีม และไม่ได้สิทธิ์ของ rooftop
assert.equal(grantsRole("b2b", "b2b"), true);
assert.equal(grantsRole("purchase", "purchase"), true);
assert.equal(grantsRole("b2b", "purchase"), false);
assert.equal(grantsRole("purchase", "b2b"), false);
assert.equal(hasAnyGrantedRole(["b2b"], ["sales", "solar", "sales_sup", "solar_sup", "account"]), false);
assert.equal(hasAnyGrantedRole(["purchase"], ["sales", "solar", "sales_sup", "solar_sup", "account"]), false);
assert.equal(hasAnyGrantedRole(["sales_sup", "solar_sup"], ["b2b", "purchase"]), false);
assert.deepEqual(parseActiveRolesHeader('["b2b","purchase"]'), ["b2b", "purchase"]);
assert.deepEqual(resolveEffectiveRoles(["admin"], ["purchase"]), ["purchase"]);
assert.deepEqual(resolveEffectiveRoles(["b2b"], ["purchase"]), []);
// ผู้ตรวจสอบใบเสนอราคา B2B 3 ชั้น — ไม่สืบทอด b2b และไม่สืบทอดกันเอง (แผน 20261015-07)
assert.equal(grantsRole("b2b_review1", "b2b"), false);
assert.equal(grantsRole("b2b_review3", "b2b_review2"), false);
assert.deepEqual(parseActiveRolesHeader('["b2b_review1","b2b_review2","b2b_review3"]'), ["b2b_review1", "b2b_review2", "b2b_review3"]);
assert.deepEqual(resolveEffectiveRoles(["b2b_review2"], ["b2b_review2"]), ["b2b_review2"]);
assert.deepEqual(resolveEffectiveRoles(["b2b_review2"], ["b2b_review1"]), []);

console.log("role-permissions tests passed");
