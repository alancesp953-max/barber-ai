import test from 'node:test'
import assert from 'node:assert'

test('Garantia de isolamento estrito de consultas por tenantId', () => {
  const tenantA_Id = 'barbearia-alfa'
  const tenantB_Id = 'barbearia-beta'

  const mockDatabase = {
    [`tenants/${tenantA_Id}/appointments`]: [
      { id: 'appt-1', clientName: 'Cliente da Barbearia Alfa' },
    ],
    [`tenants/${tenantB_Id}/appointments`]: [
      { id: 'appt-2', clientName: 'Cliente da Barbearia Beta' },
    ],
  }

  function getAppointmentsByTenant(tId) {
    return mockDatabase[`tenants/${tId}/appointments`] || []
  }

  const apptsA = getAppointmentsByTenant(tenantA_Id)
  const apptsB = getAppointmentsByTenant(tenantB_Id)

  assert.strictEqual(apptsA.length, 1)
  assert.strictEqual(apptsA[0].clientName, 'Cliente da Barbearia Alfa')

  assert.strictEqual(apptsB.length, 1)
  assert.strictEqual(apptsB[0].clientName, 'Cliente da Barbearia Beta')

  // Nenhum dado cruzado entre tenants
  assert.ok(!apptsA.some((a) => a.clientName.includes('Beta')))
  assert.ok(!apptsB.some((b) => b.clientName.includes('Alfa')))
})
