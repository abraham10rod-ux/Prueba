# ⚡ Red Neuronal del Proyecto (Sistema Operativo de Bloques)

> **Arquitectura Central:** A partir de los 9 bloques troncales del proyecto productivo, el sistema funciona como una red interconectada donde cada fase alimenta a la siguiente, dividiéndose posteriormente en tres ramas de especialización tecnológica según el enfoque técnico que se requiera implementar.

---

## 📊 Diagrama de Conexiones (9 Bloques Troncales)

```mermaid
graph TD
    %% Definición de Estilos
    classDef core fill:#1e1e2e,stroke:#89b4fa,stroke-width:2px,color:#cdd6f4;
    classDef link fill:#313244,stroke:#fab387,stroke-width:1px,color:#cdd6f4;

    %% Conexiones del Sistema de Cableado
    P1["🔌 1. Problema y Solución"] -->|"Inyecta Demanda"| P2["⚡ 2. Propuesta Comercial"]
    P2 -->|"Alimenta Operaciones"| P3["⚙️ 3. Modelo Operativo"]
    P3 -->|"Requiere Estructura"| P4["👥 4. Arquitectura Organizacional"]
    P4 -->|"Ejecuta con Presupuesto"| P5["💰 5. Modelo Financiero"]
    P5 -->|"Mide Retorno"| P6["🌱 6. Evaluación de Impacto"]
    P3 -->|"Sincroniza Tiempos"| P7["📅 7. Hoja de Ruta"]
    P7 -->|"Protege el Flujo"| P8["🛡️ 8. Gestión de Riesgos"]
    P8 -->|"Soporta la Red"| P9["📂 9. Anexos y Evidencias"]

    class P1,P2,P3,P4,P5,P6,P7,P8,P9 core;
