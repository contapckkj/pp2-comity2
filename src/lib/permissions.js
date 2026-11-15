'use strict';

/**
 * Permissões por função. Formato: 'recurso:ação'. '*' libera tudo; 'recurso:*' libera o recurso.
 * Para criar outra função (ex.: 'gerente'), adicione uma entrada aqui. Funções desconhecidas
 * não recebem nenhuma permissão.
 */
const ROLE_PERMISSIONS = Object.freeze({
  ceo: ['*'],
});

function can(role, permission) {
  const granted = ROLE_PERMISSIONS[role];
  if (!granted) return false;
  return (
    granted.includes('*') ||
    granted.includes(permission) ||
    granted.includes(`${permission.split(':')[0]}:*`)
  );
}

module.exports = { ROLE_PERMISSIONS, can };
