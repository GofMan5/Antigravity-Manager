import { Outlet } from 'react-router-dom';

import Navbar from './Navbar';
import BackgroundTaskRunner from '../common/BackgroundTaskRunner';
import { ToastContainer } from '@/shared/ui';

function Layout() {
    return (
        <div className="h-screen flex flex-col bg-[#FAFBFC] dark:bg-base-300">
            {/* 全局窗口拖拽区域 - 使用 JS 手动触发拖拽，解决 HTML 属性失效问题 */}
            {/* Removed fixed global drag region to allow Navbar to handle it integrally */}
            <BackgroundTaskRunner />
            <ToastContainer />
            <Navbar />
            <main className="flex-1 overflow-hidden flex flex-col relative pt-16">
                <Outlet />
            </main>
        </div>
    );
}

export default Layout;
