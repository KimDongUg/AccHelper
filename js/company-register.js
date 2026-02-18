document.addEventListener('DOMContentLoaded', () => {
    const companyForm = document.getElementById('companyForm');
    const userForm = document.getElementById('userForm');
    const errorDiv = document.getElementById('registerError');
    const errorMsg = document.getElementById('registerErrorMsg');
    const successDiv = document.getElementById('registerSuccess');
    const successMsg = document.getElementById('registerSuccessMsg');
    const nextBtn = document.getElementById('nextBtn');
    const registerBtn = document.getElementById('registerBtn');
    const prevBtn = document.getElementById('prevBtn');

    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step1Indicator = document.getElementById('step1Indicator');
    const step2Indicator = document.getElementById('step2Indicator');
    const companySummary = document.getElementById('companySummary');

    let createdCompanyId = null;
    let createdCompanyName = '';

    function showError(msg) {
        successDiv.classList.remove('show');
        errorMsg.textContent = msg;
        errorDiv.classList.add('show');
    }

    function hideError() {
        errorDiv.classList.remove('show');
    }

    function showSuccess(msg) {
        errorDiv.classList.remove('show');
        successMsg.textContent = msg;
        successDiv.classList.add('show');
    }

    function setLoading(btn, loading) {
        btn.disabled = loading;
        btn.classList.toggle('loading', loading);
    }

    function goToStep2() {
        step1.style.display = 'none';
        step2.style.display = '';
        step1Indicator.classList.remove('active');
        step1Indicator.classList.add('completed');
        step2Indicator.classList.add('active');
        companySummary.textContent = createdCompanyName;
        hideError();
        document.getElementById('email').focus();
    }

    function goToStep1() {
        step2.style.display = 'none';
        step1.style.display = '';
        step2Indicator.classList.remove('active');
        step1Indicator.classList.remove('completed');
        step1Indicator.classList.add('active');
        hideError();
    }

    // Step 1: Register company
    companyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();

        const companyName = document.getElementById('companyName').value.trim();
        const companyCode = document.getElementById('companyCode').value.trim();
        const businessNumber = document.getElementById('businessNumber').value.trim();
        const companyPhone = document.getElementById('companyPhone').value.trim();

        if (!companyName) { showError('회사명을 입력해 주세요.'); return; }
        if (!companyCode) { showError('회사 코드를 입력해 주세요.'); return; }

        setLoading(nextBtn, true);

        try {
            const result = await apiPost('/companies', {
                company_name: companyName,
                company_code: companyCode,
                business_number: businessNumber || null,
                phone: companyPhone || null,
            });

            createdCompanyId = result.company_id;
            createdCompanyName = companyName;
            goToStep2();
        } catch (err) {
            showError(err.message);
        } finally {
            setLoading(nextBtn, false);
        }
    });

    // Previous button
    prevBtn.addEventListener('click', () => {
        goToStep1();
    });

    // Step 2: Register first user
    userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const passwordConfirm = document.getElementById('passwordConfirm').value;
        const fullName = document.getElementById('fullName').value.trim();
        const phone = document.getElementById('userPhone').value.trim();

        if (!email) { showError('이메일을 입력해 주세요.'); return; }
        if (!password) { showError('비밀번호를 입력해 주세요.'); return; }
        if (password.length < 6) { showError('비밀번호는 6자 이상이어야 합니다.'); return; }
        if (password !== passwordConfirm) { showError('비밀번호가 일치하지 않습니다.'); return; }
        if (!fullName) { showError('이름을 입력해 주세요.'); return; }

        setLoading(registerBtn, true);

        try {
            const result = await apiPost('/auth/register', {
                company_id: createdCompanyId,
                email,
                password,
                full_name: fullName,
                phone: phone || null,
            });

            if (result.success) {
                showSuccess(result.message || '등록이 완료되었습니다. 로그인 페이지로 이동합니다.');
                userForm.reset();
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 1500);
            } else {
                showError(result.message || '등록에 실패했습니다.');
            }
        } catch (err) {
            showError(err.message);
        } finally {
            setLoading(registerBtn, false);
        }
    });

    document.getElementById('companyName').focus();
});
