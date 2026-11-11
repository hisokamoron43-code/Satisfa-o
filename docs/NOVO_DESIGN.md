# Nova interface (aplicada)

Alterações feitas sobre a versão `sicsc-v5-corrigido`, mantendo as cores da marca (`brand`, `brand-dark`, `brand-deep`).

- `src/index.css`: (só dentro da aplicação autenticada; o login fica como estava) texto mínimo legível no telemóvel, modais em folha inferior (`modal-sheet`), avisos acima da navegação inferior, foco visível.
- `src/components/layout/BottomNav.tsx` (novo): navegação inferior (até 3 atalhos conforme as páginas permitidas + "Mais").
- `src/components/layout/Sidebar.tsx`: menu agrupado pelas secções de `config/pages.ts`, ícones distintos, sem etiquetas de ruído.
- `src/components/layout/Header.tsx`: alvos de toque de 44 px, estado do Supabase só para administradores, botão de tema no menu do perfil.
- `src/components/layout/AppLayout.tsx`: integra a navegação inferior.
- `src/context/ThemeContext.tsx`: o botão flutuante de tema só aparece fora da aplicação (ex.: login).
- `src/pages/EmployeeManagement.tsx`: modal "Registar Funcionário" em 3 passos (Identificação, Contactos, Acesso), folha inferior no telemóvel, perfis de acesso rápidos (Operacional, Qualidade & RH, Direção) com lista detalhada em "Personalizar páginas", palavra-passe com mostrar/ocultar e gerador.

Os perfis rápidos estão definidos em `ACCESS_PRESETS` (EmployeeManagement.tsx) e devem ser confirmados com as regras reais de permissões.
