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

console.log("role-permissions tests passed");
