<script setup lang="ts">
import { ref, computed } from 'vue'

const emit = defineEmits<{
  'files-uploaded': [files: File[]]
}>()

const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const uploadedFiles = ref<File[]>([])
const collapsed = ref(false)

const hasFiles = computed(() => uploadedFiles.value.length > 0)

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave() {
  isDragging.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  if (e.dataTransfer?.files) {
    addFiles(Array.from(e.dataTransfer.files))
  }
}

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files) {
    addFiles(Array.from(target.files))
  }
}

function addFiles(files: File[]) {
  const xlsxFiles = files.filter(f =>
    f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
  )
  uploadedFiles.value = [...uploadedFiles.value, ...xlsxFiles]
  emit('files-uploaded', uploadedFiles.value)
  collapsed.value = true
}

function removeFile(index: number) {
  uploadedFiles.value = uploadedFiles.value.filter((_, i) => i !== index)
  if (uploadedFiles.value.length > 0) {
    emit('files-uploaded', uploadedFiles.value)
  } else {
    collapsed.value = false
  }
}

function openFilePicker() {
  fileInput.value?.click()
}
</script>

<template>
  <div class="bg-white rounded-lg border border-gray-200">
    <button
      v-if="hasFiles"
      class="w-full px-6 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
      @click="collapsed = !collapsed"
    >
      <div class="flex items-center gap-2">
        <svg
          class="h-4 w-4 text-gray-400 transition-transform"
          :class="{ 'rotate-90': !collapsed }"
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
        </svg>
        <span class="text-sm font-medium text-gray-700">
          已上传 {{ uploadedFiles.length }} 个文件
        </span>
      </div>
      <span class="text-xs text-blue-600">{{ collapsed ? '展开' : '收起' }}</span>
    </button>

    <div v-if="!hasFiles || !collapsed" class="p-6" :class="{ 'pt-0': hasFiles }">
      <h2 v-if="!hasFiles" class="text-lg font-semibold text-gray-900 mb-4">上传富途年度结单</h2>

      <div
        class="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors"
        :class="isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
        @click="openFilePicker"
      >
        <input
          ref="fileInput"
          type="file"
          accept=".xlsx,.xls"
          multiple
          class="hidden"
          @change="handleFileSelect"
        />
        <div class="text-gray-500">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p class="mt-2 text-sm">
            拖拽文件到此处，或
            <span class="text-blue-600 font-medium">点击选择文件</span>
          </p>
          <p class="mt-1 text-xs text-gray-400">
            支持 .xlsx 格式（年度账单 + 利息股息及其他收入汇总）
          </p>
        </div>
      </div>

      <div v-if="uploadedFiles.length > 0" class="mt-4 space-y-2">
        <div
          v-for="(file, index) in uploadedFiles"
          :key="file.name + index"
          class="flex items-center justify-between bg-gray-50 rounded px-3 py-2 text-sm"
        >
          <span class="text-gray-700 truncate">{{ file.name }}</span>
          <button
            class="text-gray-400 hover:text-red-500 ml-2 shrink-0"
            @click.stop="removeFile(index)"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
