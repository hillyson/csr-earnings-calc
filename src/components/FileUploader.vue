<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  'files-uploaded': [files: File[]]
}>()

const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const uploadedFiles = ref<File[]>([])

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
}

function removeFile(index: number) {
  uploadedFiles.value = uploadedFiles.value.filter((_, i) => i !== index)
  if (uploadedFiles.value.length > 0) {
    emit('files-uploaded', uploadedFiles.value)
  }
}

function openFilePicker() {
  fileInput.value?.click()
}
</script>

<template>
  <div class="bg-white rounded-lg border border-gray-200 p-6">
    <h2 class="text-lg font-semibold text-gray-900 mb-4">上传富途年度结单</h2>

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
</template>
