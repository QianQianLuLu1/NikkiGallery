import type { ContextMenuItem } from '../components/common/ContextMenu'
import type { ShareChannelId } from '../components/common/ShareGuideDialog'
import type { MediaFile } from '../stores/mediaStore'
import {
  IconOpen,
  IconEdit,
  IconSaveAs,
  IconExport,
  IconCopy,
  IconMove,
  IconRename,
  IconFavorite,
  IconDelete,
  IconProperties,
  IconSelectAll,
  IconShare,
  IconWeChat,
  IconQQ,
  IconVivo,
  IconFolderOpen
} from '../icons'

export interface GalleryContextMenuActions {
  onOpen: (file: MediaFile) => void
  onEdit: (file: MediaFile) => void
  onSaveAs: (file: MediaFile) => void
  onExport: (file: MediaFile) => void
  onCopy: (file: MediaFile) => void
  onMove: (file: MediaFile) => void
  onRename: (file: MediaFile) => void
  onToggleFavorite: (file: MediaFile) => void
  onDelete: (file: MediaFile) => void
  onDeletePermanent: (file: MediaFile) => void
  onShowProperties: (file: MediaFile) => void
  onSelectAllInCategory?: () => void
  // 打开文件所在目录（在资源管理器中选中）
  onOpenLocation?: (file: MediaFile) => void
  // T09：剪贴板分享（单文件）
  onShare?: (file: MediaFile, channelId: ShareChannelId) => void
}

// U7：改为函数工厂，避免模块级 React elements 在模块加载时创建且被所有调用共享
// 每次调用 getContextMenuItems 时创建新的 icon 元素，避免潜在的复用问题
function createIcons() {
  return {
    open: <IconOpen size={16} />,
    edit: <IconEdit size={16} />,
    saveAs: <IconSaveAs size={16} />,
    export: <IconExport size={16} />,
    copy: <IconCopy size={16} />,
    move: <IconMove size={16} />,
    rename: <IconRename size={16} />,
    favorite: (isFavorite: boolean) => <IconFavorite size={16} filled={isFavorite} />,
    delete: <IconDelete size={16} />,
    properties: <IconProperties size={16} />,
    folderOpen: <IconFolderOpen size={16} />,
    share: <IconShare size={16} />,
    wechat: <IconWeChat size={16} />,
    qq: <IconQQ size={16} />,
    vivo: <IconVivo size={16} />,
    selectAll: <IconSelectAll size={16} />
  }
}

export function getContextMenuItems(file: MediaFile, actions: GalleryContextMenuActions): ContextMenuItem[] {
  const icons = createIcons()
  return [
    {
      id: 'open',
      label: '打开',
      icon: icons.open,
      onClick: () => actions.onOpen(file)
    },
    {
      id: 'edit',
      label: '编辑',
      icon: icons.edit,
      disabled: file.file_type === 'video',
      onClick: () => actions.onEdit(file)
    },
    {
      id: 'openLocation',
      label: '打开文件所在位置',
      icon: icons.folderOpen,
      onClick: () => actions.onOpenLocation?.(file)
    },
    { id: 'divider-1', label: '', divider: true },
    {
      id: 'saveAs',
      label: '另存为',
      icon: icons.saveAs,
      onClick: () => actions.onSaveAs(file)
    },
    {
      id: 'export',
      label: '导出',
      icon: icons.export,
      onClick: () => actions.onExport(file)
    },
    {
      id: 'copy',
      label: '复制到',
      icon: icons.copy,
      onClick: () => actions.onCopy(file)
    },
    {
      id: 'move',
      label: '移动到',
      icon: icons.move,
      onClick: () => actions.onMove(file)
    },
    {
      id: 'rename',
      label: '重命名',
      icon: icons.rename,
      onClick: () => actions.onRename(file)
    },
    // T09：分享二级子菜单（微信 / QQ / vivo办公套件）
    ...(actions.onShare
      ? [{
          id: 'share',
          label: '分享',
          icon: icons.share,
          onClick: () => {},
          submenu: [
            {
              id: 'share-wechat',
              label: '分享到微信',
              icon: icons.wechat,
              onClick: () => actions.onShare!(file, 'wechat')
            },
            {
              id: 'share-qq',
              label: '分享到QQ',
              icon: icons.qq,
              onClick: () => actions.onShare!(file, 'qq')
            },
            {
              id: 'share-vivo',
              label: '分享到vivo办公套件',
              icon: icons.vivo,
              onClick: () => actions.onShare!(file, 'vivo')
            }
          ]
        }]
      : []),
    { id: 'divider-2', label: '', divider: true },
    {
      id: 'favorite',
      label: file.is_favorite ? '取消收藏' : '收藏',
      icon: icons.favorite(file.is_favorite),
      onClick: () => actions.onToggleFavorite(file)
    },
    {
      id: 'delete',
      label: '删除',
      danger: true,
      icon: icons.delete,
      onClick: () => actions.onDelete(file)
    },
    {
      id: 'deletePermanent',
      label: '永久删除',
      danger: true,
      icon: icons.delete,
      onClick: () => actions.onDeletePermanent(file)
    },
    { id: 'divider-3', label: '', divider: true },
    {
      id: 'selectAllInCategory',
      label: '全选当前分类',
      icon: icons.selectAll,
      onClick: () => actions.onSelectAllInCategory?.()
    },
    {
      id: 'properties',
      label: '属性',
      icon: icons.properties,
      onClick: () => actions.onShowProperties(file)
    }
  ]
}
