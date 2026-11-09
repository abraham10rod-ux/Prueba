# ⚡ Arquitectura Integral del Proyecto: Núcleo y Ramificaciones Tecnológicas

> **Estructura Troncal:** Los 9 bloques fundamentales del proyecto actúan como el núcleo central (Backbone). A partir de esta base común, el sistema se despliega hacia tres ramas de especialización tecnológica.

---

## 🖧 Topología Troncal (Los 9 Bloques como Red de Infraestructura)

```mermaid
graph TD
    %% Definición de Estilos de Red
    classDef router fill:#11111b,stroke:#89b4fa,stroke-width:3px,color:#cdd6f4,rx:5px,ry:5px;
    classDef switch fill:#181825,stroke:#a6e3a1,stroke-width:2px,color:#cdd6f4,rx:10px,ry:10px;

    %% Conexiones de Enrutamiento y Conmutación
    P1["🌐 [Router Core] 1. Problema y Solución"] -->|"BGP / Tráfico WAN"| P2["🔀 [Switch Core] 2. Propuesta Comercial"]
    P2 -->|"VLAN 10 / Enlace Trunk"| P3["⚙️ [Router Dist] 3. Modelo Operativo"]
    P3 -->|"VLAN 20 / Acceso"| P4["👥 [Switch Acc] 4. Arquitectura Organizacional"]
    P4 -->|"QoS / Asignación"| P5["💰 [Router Edge] 5. Modelo Financiero"]
    P5 -->|"Métricas / Telemetría"| P6["🌱 [Switch Core] 6. Evaluación de Impacto"]
    P3 -->|"Clocking / Sincronía"| P7["📅 [Router Core] 7. Hoja de Ruta"]
    P7 -->|"Firewall / ACLs"| P8["🛡️ [Switch Sec] 8. Gestión de Riesgos"]
    P8 -->|"Storage / Backplane"| P9["📂 [Router NAS] 9. Anexos y Evidencias"]

    class P1,P3,P5,P7,P9 router;
    class P2,P4,P6,P8 switch;
