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

    let autoCompanyCode = '';

    // Step 1에서 수집한 회사 정보 보관
    let companyData = {};

    // Auto-generate company code from latest company_id + 1
    (async function loadNextCode() {
        try {
            const result = await apiGet('/companies/public');
            const companies = result.companies || result;
            let maxId = 0;
            if (companies && companies.length > 0) {
                companies.forEach(c => {
                    if (c.company_id > maxId) maxId = c.company_id;
                });
            }
            autoCompanyCode = String(maxId + 1);
            document.getElementById('companyCode').value = autoCompanyCode;
        } catch {
            autoCompanyCode = '1';
            document.getElementById('companyCode').value = '1';
        }
    })();

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
        companySummary.textContent = companyData.company_name;
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

    // Step 1: 회사 정보 수집 (API 호출 없음, Step 2로 이동)
    companyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        hideError();

        const companyName = document.getElementById('companyName').value.trim();
        const companyCode = autoCompanyCode || document.getElementById('companyCode').value.trim();
        const companyAddress = document.getElementById('companyAddress').value.trim();
        const companyPhone = document.getElementById('companyPhone').value.trim();

        if (!companyName) { showError('회사명을 입력해 주세요.'); return; }
        if (!companyCode) { showError('회사 코드를 불러오지 못했습니다. 새로고침 해주세요.'); return; }
        if (!companyAddress) { showError('회사 주소를 입력해 주세요.'); return; }
        if (!companyPhone) { showError('전화번호를 입력해 주세요.'); return; }

        companyData = {
            company_name: companyName,
            company_code: companyCode,
            address: companyAddress,
            phone: companyPhone,
        };

        goToStep2();
    });

    // Previous button
    prevBtn.addEventListener('click', () => {
        goToStep1();
    });

    // Step 2: 관리자 계정 입력 → 회사+관리자 한번에 등록
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
            const result = await apiPost('/companies/register', {
                ...companyData,
                admin_email: email,
                admin_password: password,
                admin_name: fullName,
                admin_phone: phone || null,
            });

            showSuccess('회사와 관리자 계정이 등록되었습니다. 로그인 페이지로 이동합니다.');
            userForm.reset();
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 1500);
        } catch (err) {
            showError(err.message);
        } finally {
            setLoading(registerBtn, false);
        }
    });

    document.getElementById('companyName').focus();
});
