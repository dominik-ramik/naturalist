<script setup>
/**
 * SCols.vue — transparent wrapper for <SCol> children.
 *
 * Does not render any DOM element itself.
 * Its only job is to provide a logical grouping that makes
 * the template easier to read:
 *
 *   <Sheet name="survey">
 *     <SCols>
 *       <SCol width="140px" />
 *       <SCol width="100px" />
 *       <SCol empty />
 *       <SCol width="200px" />
 *     </SCols>
 *     <SRow> … </SRow>
 *   </Sheet>
 *
 * Each <SCol> registers itself directly with the parent <Sheet>
 * via provide/inject — SCols itself doesn't need any logic.
 */
</script>

<template>
  <!-- renderless wrapper -->
  <slot />
</template>
